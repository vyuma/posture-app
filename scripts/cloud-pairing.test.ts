import { afterEach, expect, test } from "bun:test";
import type { Server } from "node:http";
import { WebSocket } from "ws";
import { createCloudPairingServer } from "../server/pairing/server";
import { cloudPairingEnvironment } from "../server/pairing/config";
import {
  HOST_LEASE_MS, newRoom, PairingError, requireRoom, ROOM_TTL_SECONDS,
  snapshot, type Room, type RoomStore,
} from "../server/pairing/room";
import { RedisRoomStore } from "../server/pairing/redis-store";

// Two independent HTTP/WS instances share this store, as production instances share Redis.
class MemoryRooms implements RoomStore {
  rooms = new Map<string, Room>();
  listeners = new Map<string, Set<(room: Room) => void>>();
  canCreate = true;
  failSubscription: (() => void) | undefined;
  constructor(private clock: () => number) {}
  async create(room: Room) { this.rooms.set(room.id, structuredClone(room)); }
  async get(id: string) { return structuredClone(this.rooms.get(id) ?? null); }
  async update(id: string, change: (room: Room) => Room) {
    const old = requireRoom(this.rooms.get(id) ?? null, this.clock());
    const next = { ...change(structuredClone(old)), revision: old.revision + 1 };
    this.rooms.set(id, next);
    for (const listener of this.listeners.get(id) ?? []) listener(structuredClone(next));
    return next;
  }
  async subscribe(id: string, changed: (room: Room) => void, failed: () => void) {
    const listeners = this.listeners.get(id) ?? new Set();
    this.listeners.set(id, listeners);
    listeners.add(changed);
    this.failSubscription = failed;
    return () => { listeners.delete(changed); };
  }
  async allowCreation() { return this.canCreate; }
}

const servers: Server[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.terminate());
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function setup(storeOverride?: RoomStore) {
  let time = Date.now();
  const store = storeOverride ?? new MemoryRooms(() => time);
  const config = { postureOrigin: "https://posture.example", vibeOrigin: "https://vibe.example" };
  async function instance() {
    const server = createCloudPairingServer(() => ({ store, config }), { now: () => time, tickMs: 10 });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    return `http://127.0.0.1:${address.port}`;
  }
  const first = await instance();
  const second = await instance();
  return { store, config, first, second, advance: (ms: number) => { time += ms; } };
}

async function openRoom(base: string) {
  const response = await fetch(`${base}/api/pairing/info`, { headers: { "X-Posture-Client": "browser" } });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie")!;
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Strict");
  const info = await response.json() as { browserUrl: string; token: string };
  const link = new URL(info.browserUrl);
  expect(link.origin).toBe("https://vibe.example");
  expect(link.searchParams.get("relay")).toBe("https://posture.example/api/pairing");
  expect(info).not.toHaveProperty("ownerHash");
  return { id: link.searchParams.get("room")!, token: info.token, cookie: setCookie.split(";")[0], info };
}

function owner(base: string, cookie: string, action: string, body?: unknown) {
  return fetch(`${base}/api/pairing/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Cookie: cookie, Origin: "https://posture.example", "X-Posture-Client": "browser", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function phone(base: string, room: { id: string; token: string }, action = "pair", origin = "https://vibe.example") {
  return fetch(`${base}/api/pairing/${action}`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: room.id, token: room.token, deviceName: "iPhone Safari" }),
  });
}

function connect(base: string, room: { id: string; token: string }) {
  const events: ReturnType<typeof snapshot>[] = [];
  const client = new WebSocket(`${base.replace("http", "ws")}/api/pairing/ws?room=${room.id}&token=${room.token}`, { origin: "https://vibe.example" });
  sockets.push(client);
  client.on("message", (raw) => events.push(JSON.parse(raw.toString())));
  return { client, events };
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2500;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for cloud pairing");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("public QR relays registration/posture between server instances and restores the latest snapshot after reconnect", async () => {
  const { first, second } = await setup();
  const room = await openRoom(first);
  const paired = await phone(second, room);
  expect(paired.headers.get("access-control-allow-origin")).toBe("https://vibe.example");
  expect(await paired.json()).toMatchObject({ ok: true, paired: true });
  expect(await (await owner(first, room.cookie, "status")).json()).toMatchObject({ paired: true });
  const firstSocket = connect(second, room);
  await until(() => firstSocket.events.length > 0);
  expect(firstSocket.events[0]).toMatchObject({ isBad: false, measuringSessionActive: false });

  expect((await owner(first, room.cookie, "session", { measuring: false, registering: true, isBad: false })).ok).toBe(true);
  await until(() => firstSocket.events.at(-1)?.goodPostureRegistrationActive === true);
  await owner(first, room.cookie, "session", { measuring: true, registering: false, isBad: true });
  await until(() => firstSocket.events.at(-1)?.isBad === true);
  expect(JSON.stringify(firstSocket.events)).not.toContain(room.token);
  expect(JSON.stringify(firstSocket.events)).not.toContain("ownerHash");

  firstSocket.client.close();
  await until(() => firstSocket.client.readyState === WebSocket.CLOSED);
  const reconnected = connect(first, room);
  await until(() => reconnected.events.length > 0);
  expect(reconnected.events[0]).toMatchObject({ isBad: true, measuringSessionActive: true });
  await owner(second, room.cookie, "session", { measuring: false, registering: false, isBad: true });
  await until(() => reconnected.events.at(-1)?.measuringSessionActive === false);
  expect(reconnected.events.at(-1)?.isBad).toBe(false);
  await phone(second, room, "disconnect");
  await until(() => reconnected.client.readyState === WebSocket.CLOSED);
  expect(await (await owner(first, room.cookie, "status")).json()).toMatchObject({ paired: false });
});

test("public rooms isolate viewers, owner cookies, and origins; phone tokens cannot send posture", async () => {
  const { first, second } = await setup();
  const a = await openRoom(first);
  const b = await openRoom(second);
  expect(a.id).not.toBe(b.id);
  expect((await phone(second, { ...a, token: b.token })).status).toBe(401);
  expect((await phone(second, a, "pair", "https://unrelated.example")).status).toBe(403);
  expect((await owner(first, "", "session", { measuring: true, registering: false })).status).toBe(401);
  expect((await owner(first, `posture_pairing_owner=${a.id}.${a.token}`, "session", { measuring: true, registering: false })).status).toBe(401);
  expect((await owner(first, a.cookie, "session", { measuring: "true", registering: false })).status).toBe(400);
  expect((await fetch(`${first}/api/pairing/info`)).status).toBe(403);
  expect((await fetch(`${first}/api/pairing/info`, { headers: { "X-Posture-Client": "browser", Origin: "https://vibe.example" } })).status).toBe(403);
  expect((await fetch(`${first}/api/pairing/pair?room=${a.id}&token=${a.token}`)).status).toBe(405);
  const preflight = await fetch(`${first}/api/pairing/pair`, { method: "OPTIONS", headers: { Origin: "https://vibe.example" } });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");

  await phone(first, a);
  const viewer = connect(second, a);
  await until(() => viewer.events.length > 0);
  await owner(first, b.cookie, "session", { measuring: true, registering: false, isBad: true });
  expect(viewer.events.at(-1)?.isBad).toBe(false);
  expect(await (await owner(first, b.cookie, "status")).json()).toMatchObject({ paired: false });
});

test("lost PC heartbeats stop a stale alert and expired rooms require a new QR", async () => {
  const { first, second, advance } = await setup();
  const room = await openRoom(first);
  await phone(second, room);
  const viewer = connect(second, room);
  await until(() => viewer.events.length > 0);
  await owner(first, room.cookie, "session", { measuring: true, registering: false, isBad: true });
  await until(() => viewer.events.at(-1)?.isBad === true);
  advance(HOST_LEASE_MS + 1);
  await until(() => viewer.events.at(-1)?.isBad === false);
  expect(viewer.events.at(-1)?.measuringSessionActive).toBe(false);
  await owner(first, room.cookie, "session", { measuring: true, registering: false, isBad: true });
  await until(() => viewer.events.at(-1)?.isBad === true);

  let closeCode = 0;
  viewer.client.on("close", (code) => { closeCode = code; });
  advance(ROOM_TTL_SECONDS * 1000);
  await until(() => closeCode === 4001);
  expect((await phone(first, room)).status).toBe(401);
  const renewed = await owner(first, room.cookie, "info");
  expect(renewed.status).toBe(200);
  expect(new URL((await renewed.json() as any).browserUrl).searchParams.get("room")).not.toBe(room.id);
});

test("a subscription failure closes the socket so the client can reconnect and reload", async () => {
  const { first, store } = await setup();
  const room = await openRoom(first);
  await phone(first, room);
  const viewer = connect(first, room);
  await until(() => viewer.events.length > 0);
  let code = 0;
  viewer.client.on("close", (value) => { code = value; });
  (store as MemoryRooms).failSubscription?.();
  await until(() => code === 1011);
});

test("creation throttling and missing deployment configuration produce actionable errors", async () => {
  const { first, store } = await setup();
  (store as MemoryRooms).canCreate = false;
  expect((await fetch(`${first}/api/pairing/info`, { headers: { "X-Posture-Client": "browser" } })).status).toBe(429);
  const previous = process.env.POSTURE_PUBLIC_URL;
  delete process.env.POSTURE_PUBLIC_URL;
  try { expect(() => cloudPairingEnvironment()).toThrow(PairingError); }
  finally {
    if (previous === undefined) delete process.env.POSTURE_PUBLIC_URL;
    else process.env.POSTURE_PUBLIC_URL = previous;
  }
});

// Optional integration check using a dedicated local/test Redis, never the production database.
test.skipIf(!process.env.TEST_REDIS_URL)("Redis atomically combines concurrent updates and delivers across separate connections", async () => {
  const prefix = `posture:test:${crypto.randomUUID()}:`;
  const first = new RedisRoomStore(process.env.TEST_REDIS_URL!, prefix);
  const second = new RedisRoomStore(process.env.TEST_REDIS_URL!, prefix);
  let unsubscribe: (() => void) | undefined;
  try {
    const { room } = newRoom();
    await first.create(room);
    const received: Room[] = [];
    unsubscribe = await second.subscribe(room.id, (state) => received.push(state), () => {});
    await Promise.all([
      first.update(room.id, (state) => ({ ...state, measuring: true, isBad: true })),
      second.update(room.id, (state) => ({ ...state, paired: true, deviceName: "iPhone" })),
    ]);
    const final = await second.get(room.id);
    expect(final).toMatchObject({ measuring: true, isBad: true, paired: true, deviceName: "iPhone", revision: 2 });
    await until(() => received.some((state) => state.revision === 2));
    expect(received.at(-1)).toEqual(final);
  } finally { unsubscribe?.(); first.close(); second.close(); }
});
