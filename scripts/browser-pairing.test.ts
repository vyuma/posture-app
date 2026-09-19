import { afterEach, expect, test } from "bun:test";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import { WebSocket } from "ws";
import { browserPairingPlugin } from "./browser-pairing-plugin";
import { getPairingInfo, getDesktopPairingStatus, sendPostureSignal, syncBrowserPairingSession } from "../src/features/pairing/services/desktopBridge";
import { buildPairingLink } from "../src/features/pairing/services/pairingLink";
import { generateQrDataUrl } from "../src/lib/qrcode";

const originalFetch = globalThis.fetch;
let server: Server | undefined;
const clients: WebSocket[] = [];
afterEach(async () => {
  globalThis.fetch = originalFetch;
  clients.splice(0).forEach((client) => client.terminate());
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  server = undefined;
});

async function setup() {
  let middleware: (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
  server = createServer((request, response) => middleware(request, response, () => {
    response.writeHead(404);
    response.end();
  }));
  const plugin = browserPairingPlugin({ listenHost: "127.0.0.1", resolveHost: () => "127.0.0.1", leaseMs: 800 });
  // Exercise the registered Vite middleware over HTTP; Vite's own watcher is not needed here.
  (plugin.configureServer as (server: ViteDevServer) => void)({
    httpServer: server,
    middlewares: { use(handler: typeof middleware) { middleware = handler; } },
  } as unknown as ViteDevServer);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  const origin = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = ((input, init) => originalFetch(
    typeof input === "string" && input.startsWith("/api/") ? `${origin}${input}` : input, init,
  )) as typeof fetch;
  return origin;
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2500;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for a pairing event");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("browser QR pairs a Vibe client and relays registration, measurement, posture, and recovery", async () => {
  await setup();
  const info = await getPairingInfo();
  const link = buildPairingLink(info);
  expect(link).toBe(info.browserUrl!);
  expect(await generateQrDataUrl(link)).toStartWith("data:image/png;base64,");
  const redirect = await fetch(link, { redirect: "manual" });
  expect(redirect.status).toBe(302);
  const target = new URL(redirect.headers.get("location")!);
  expect(target.pathname).toBe("/pairing-test");
  expect(target.searchParams.get("token")).toBe(info.token);
  expect(target.searchParams.get("port")).toBe(String(info.port));

  // Both native Vibe and its web build use these HTTP and WebSocket routes.
  const base = `http://${info.host}:${info.port}`;
  const query = new URLSearchParams({ token: info.token, deviceName: "Vibe ブラウザ" });
  const paired = await fetch(`${base}/pair?${query}`, { headers: { Origin: "http://127.0.0.1:8081" } });
  expect(paired.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8081");
  expect(await paired.json()).toMatchObject({ ok: true, paired: true, deviceName: "Vibe ブラウザ" });
  expect(await getDesktopPairingStatus()).toMatchObject({ paired: true });

  const events: any[] = [];
  const client = new WebSocket(`ws://${info.host}:${info.port}/ws?token=${info.token}`);
  clients.push(client);
  client.on("message", (message) => events.push(JSON.parse(String(message))));
  await until(() => events.some((event) => event.type === "snapshot"));
  await syncBrowserPairingSession({ measuring: false, registering: true });
  await until(() => events.some((event) => event.type === "good_posture_registration_started"));
  await syncBrowserPairingSession({ measuring: true, registering: false });
  await sendPostureSignal(true);
  await until(() => events.some((event) => event.type === "posture_bad"));
  expect(events.find((event) => event.type === "posture_bad").measuringSessionActive).toBe(true);
  const beforeRecovery = events.length;
  await sendPostureSignal(false);
  await until(() => events.slice(beforeRecovery).some((event) => event.type === "posture_good"));
  await sendPostureSignal(true);
  const beforeExpiry = events.length;
  await until(() => events.slice(beforeExpiry).some((event) => event.type === "measuring_stopped"));
  expect(events.slice(beforeExpiry).some((event) => event.type === "posture_good")).toBe(true);
  expect((await fetch(`${base}/disconnect?token=${info.token}`)).ok).toBe(true);
  expect(await getDesktopPairingStatus()).toMatchObject({ paired: false });
});

test("relay rejects invalid tokens and isolates browser controls from other origins and the phone API", async () => {
  const origin = await setup();
  const info = await getPairingInfo();
  const base = `http://${info.host}:${info.port}`;
  expect((await fetch(`${base}/pair?token=invalid&deviceName=phone`)).status).toBe(401);
  expect((await fetch(`${base}/api/pairing/info`)).status).toBe(404);
  expect((await fetch(`${origin}/api/pairing/info`)).status).toBe(403);
  expect((await fetch(`${origin}/api/pairing/info`, {
    headers: { "X-Posture-Client": "browser", Origin: "https://unrelated.example" },
  })).status).toBe(403);
  expect((await fetch(`${origin}/api/pairing/posture`, {
    method: "POST", headers: { "X-Posture-Client": "browser", "Content-Type": "application/json" }, body: '{"isBad":"false"}',
  })).status).toBe(400);
  expect(await getDesktopPairingStatus()).toMatchObject({ paired: false });
});

test("desktop builds keep using Tauri commands and do not call the browser relay", async () => {
  const globals = globalThis as any;
  const previousWindow = globals.window;
  const previousNative = globals.isTauri;
  const calls: { command: string; args: unknown }[] = [];
  globals.isTauri = true;
  globals.window = { __TAURI_INTERNALS__: { invoke: async (command: string, args: unknown) => {
    calls.push({ command, args });
    return command === "get_pairing_info" ? { host: "192.168.0.2", port: 5555, token: "native" } : {};
  } } };
  globalThis.fetch = (() => { throw new Error("Unexpected browser request"); }) as typeof fetch;
  try {
    expect(buildPairingLink(await getPairingInfo())).toStartWith("vibeapp://pair?");
    await getDesktopPairingStatus();
    await sendPostureSignal(false);
    await syncBrowserPairingSession({ measuring: false, registering: false });
    expect(calls.map((call) => call.command)).toEqual(["get_pairing_info", "get_pairing_status", "emit_posture_signal"]);
    expect(calls[2].args).toEqual({ isBad: false });
  } finally {
    if (previousWindow === undefined) delete globals.window;
    else globals.window = previousWindow;
    if (previousNative === undefined) delete globals.isTauri;
    else globals.isTauri = previousNative;
  }
});
