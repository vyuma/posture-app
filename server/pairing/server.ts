import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { PairingConfig } from "./config";
import {
  hash, HOST_LEASE_MS, newRoom, OWNER_COOKIE, ownerCredentials, PairingError,
  requireOwner, requirePhone, roomId, snapshot, type Room, type RoomStore,
} from "./room";

type Environment = { config: PairingConfig; store: RoomStore };
type Options = { now?: () => number; tickMs?: number; socketLifetimeMs?: number };

export function createCloudPairingServer(environment: () => Environment, options: Options = {}) {
  const now = options.now ?? Date.now;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => respondError(response, error));
  });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    const { config, store } = environment();
    const url = new URL(request.url ?? "/", config.postureOrigin);
    // Vercel rewrites /api/pairing/:action to /api/relay?action=:action.
    const action = url.searchParams.get("action") ?? url.pathname.split("/").pop();
    const ownerRoute = ["info", "status", "posture", "session"].includes(action ?? "");
    const phoneRoute = ["pair", "disconnect"].includes(action ?? "");
    if (!ownerRoute && !phoneRoute) throw new PairingError(404, "NOT_FOUND", "Not found");

    if (ownerRoute) {
      if (request.headers["x-posture-client"] !== "browser"
        || request.headers["sec-fetch-site"] === "cross-site"
        || (request.headers.origin && request.headers.origin !== config.postureOrigin)) {
        throw new PairingError(403, "FORBIDDEN", "Postureのページから接続してください。");
      }
    } else {
      if (!allowedPhoneOrigin(request.headers.origin, config)) {
        throw new PairingError(403, "FORBIDDEN", "この接続元は利用できません。");
      }
      if (request.headers.origin) {
        response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
        response.setHeader("Vary", "Origin");
      }
      if (request.method === "OPTIONS") {
        response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.writeHead(204);
        response.end();
        return;
      }
    }

    const method = action === "info" || action === "status" ? "GET" : "POST";
    if (request.method !== method) {
      response.setHeader("Allow", method);
      throw new PairingError(405, "METHOD_NOT_ALLOWED", `${method}のみ利用できます。`);
    }

    const credentials = ownerCredentials(request.headers.cookie);
    if (action === "info") {
      let room = credentials ? await store.get(credentials.id) : null;
      if (room && room.expiresAt > now()) {
        room = requireOwner(room, credentials!.secret, now());
      } else {
        const address = String(request.headers["x-real-ip"] ?? request.socket.remoteAddress ?? "unknown");
        if (!await store.allowCreation(hash(address))) {
          throw new PairingError(429, "RATE_LIMITED", "接続の作成回数が多いため、しばらく待ってからお試しください。");
        }
        const created = newRoom(now());
        room = created.room;
        await store.create(room);
        const secure = config.postureOrigin.startsWith("https:") ? "; Secure" : "";
        response.setHeader("Set-Cookie", `${OWNER_COOKIE}=${room.id}.${created.owner}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((room.expiresAt - now()) / 1000)}${secure}`);
      }
      const origin = new URL(config.postureOrigin);
      const browserUrl = new URL("/pairing-test", config.vibeOrigin);
      browserUrl.search = new URLSearchParams({
        relay: `${config.postureOrigin}/api/pairing`, room: room.id, token: room.phoneToken,
      }).toString();
      return json(response, 200, {
        host: origin.hostname, port: Number(origin.port || (origin.protocol === "https:" ? 443 : 80)),
        token: room.phoneToken, browserUrl: browserUrl.toString(), expiresAt: room.expiresAt,
      });
    }

    if (ownerRoute) {
      if (!credentials) throw new PairingError(401, "SESSION_EXPIRED", "PCの接続情報を取得し直してください。");
      if (action === "status") {
        const current = snapshot(requireOwner(await store.get(credentials.id), credentials.secret, now()), now());
        return json(response, 200, { paired: current.paired, deviceName: current.deviceName, lastSeenAt: current.lastSeenAt });
      }
      const body = await readBody(request);
      if (action === "posture" && typeof body.isBad !== "boolean") throw invalidBody();
      if (action === "session" && (typeof body.measuring !== "boolean" || typeof body.registering !== "boolean"
        || (body.isBad !== undefined && typeof body.isBad !== "boolean"))) throw invalidBody();
      await store.update(credentials.id, (previous) => {
        const room = requireOwner(previous, credentials.secret, now());
        if (action === "posture") {
          room.isBad = room.measuring && now() - room.hostSeenAt < HOST_LEASE_MS && body.isBad === true;
        } else {
          room.measuring = body.measuring === true;
          room.registering = body.registering === true && !room.measuring;
          room.isBad = room.measuring && (body.isBad === undefined ? room.isBad : body.isBad === true);
          room.hostSeenAt = now();
        }
        return room;
      });
      return json(response, 200, { ok: true });
    }

    const body = await readBody(request);
    const id = roomId(body.roomId);
    const token = phoneToken(body.token);
    const name = typeof body.deviceName === "string" ? body.deviceName.trim() : "";
    if (action === "pair" && (!name || name.length > 200)) {
      throw new PairingError(400, "MISSING_DEVICE_NAME", "端末名が必要です。");
    }
    await store.update(id, (previous) => {
      const room = requirePhone(previous, token, now());
      room.paired = action === "pair";
      room.deviceName = action === "pair" ? name : null;
      room.phoneSeenAt = now();
      return room;
    });
    return json(response, 200, action === "pair"
      ? { ok: true, paired: true, deviceName: name, pairedAt: new Date(now()).toISOString() }
      : { ok: true, paired: false, disconnectedAt: new Date(now()).toISOString() });
  }

  server.on("upgrade", (request, socket, head) => {
    socket.on("error", () => {});
    void (async () => {
      const { config, store } = environment();
      const url = new URL(request.url ?? "/", config.postureOrigin);
      const action = url.searchParams.get("action") ?? url.pathname.split("/").pop();
      if (action !== "ws" || !allowedPhoneOrigin(request.headers.origin, config)) {
        throw new PairingError(403, "FORBIDDEN", "Forbidden");
      }
      const id = roomId(url.searchParams.get("room"));
      const token = phoneToken(url.searchParams.get("token"));
      let room: Room;
      try {
        room = requirePhone(await store.get(id), token, now());
        if (!room.paired) throw new PairingError(401, "NOT_PAIRED", "Not paired");
      } catch (error) {
        if (error instanceof PairingError && error.status === 401) {
          // A close code lets browsers distinguish expired credentials from a transient outage.
          sockets.handleUpgrade(request, socket, head, (client) => client.close(4001, "Pair again"));
          return;
        }
        throw error;
      }
      if (socket.destroyed) return;
      sockets.handleUpgrade(request, socket, head, (client) => attach(client, room, token, store));
    })().catch((error: unknown) => {
      const status = error instanceof PairingError ? error.status : 503;
      if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    });
  });

  function attach(client: WebSocket, initial: Room, token: string, store: RoomStore) {
    let latest = initial;
    let lastPayload = "";
    let lastHeartbeat = 0;
    let closed = false;
    let unsubscribe: (() => void) | undefined;
    function send(room: Room) {
      if (closed || room.revision < latest.revision) return;
      latest = room;
      if (room.expiresAt <= now()) { client.close(4001, "Pair again"); return; }
      const state = snapshot(room, now());
      const signature = JSON.stringify({ ...state, createdAt: "" });
      if (signature !== lastPayload && client.readyState === WebSocket.OPEN) {
        if (client.bufferedAmount > 65_536) { client.close(1013, "Slow connection"); return; }
        client.send(JSON.stringify(state));
        lastPayload = signature;
      }
      if (!room.paired) client.close(4001, "Disconnected");
    }
    const tick = setInterval(() => send(latest), options.tickMs ?? 1000);
    // Reconnect before a Vercel Function's maximum duration, reloading the persisted snapshot.
    const lifetime = setTimeout(() => client.close(1012, "Reconnect"), options.socketLifetimeMs ?? 240_000);
    tick.unref();
    lifetime.unref();
    client.on("error", () => client.close());
    client.on("close", () => {
      closed = true;
      clearInterval(tick);
      clearTimeout(lifetime);
      unsubscribe?.();
    });
    client.on("message", (raw) => {
      let data: { type?: unknown };
      try { data = JSON.parse(raw.toString()); } catch { client.close(1008, "Invalid message"); return; }
      if (!data || data.type !== "ping") return;
      if (now() - lastHeartbeat < 10_000) return;
      lastHeartbeat = now();
      void store.update(initial.id, (previous) => {
        const room = requirePhone(previous, token, now());
        if (!room.paired) throw new PairingError(401, "NOT_PAIRED", "Not paired");
        room.phoneSeenAt = now();
        return room;
      }).catch((error: unknown) => client.close(error instanceof PairingError && error.status === 401 ? 4001 : 1011, "Reconnect"));
    });
    // Subscribe before fetching the initial state to avoid a gap during connection setup.
    void (async () => {
      unsubscribe = await store.subscribe(initial.id, send, () => client.close(1011, "Reconnect"));
      if (closed) { unsubscribe(); return; }
      const room = requirePhone(await store.get(initial.id), token, now());
      send(room);
    })().catch((error: unknown) => client.close(error instanceof PairingError && error.status === 401 ? 4001 : 1011, "Reconnect"));
  }

  server.on("close", () => {
    for (const client of sockets.clients) client.terminate();
    sockets.close();
  });
  return server;
}

function allowedPhoneOrigin(origin: string | undefined, config: PairingConfig) {
  return !origin || origin === config.vibeOrigin || origin === config.postureOrigin;
}

function phoneToken(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new PairingError(401, "INVALID_TOKEN", "接続リンクが無効です。PCのQRを読み直してください。");
  }
  return value;
}

function invalidBody() { return new PairingError(400, "INVALID_BODY", "送信内容が正しくありません。"); }

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw invalidBody();
  let raw = "";
  try {
    for await (const chunk of request) {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > 4096) throw invalidBody();
    }
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidBody();
    return value as Record<string, unknown>;
  } catch { throw invalidBody(); }
}

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function respondError(response: ServerResponse, error: unknown) {
  if (response.headersSent) { response.end(); return; }
  const failure = error instanceof PairingError ? error
    : new PairingError(503, "UNAVAILABLE", "接続サーバーに到達できません。少し待ってからお試しください。");
  json(response, failure.status, { ok: false, errorCode: failure.code, message: failure.message });
}
