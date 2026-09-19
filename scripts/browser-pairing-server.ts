import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { isIPv4 } from "node:net";
import { networkInterfaces } from "node:os";
import { WebSocket, WebSocketServer } from "ws";

export type BrowserSession = {
  measuring: boolean;
  registering: boolean;
};

export type BrowserPairingOptions = {
  listenHost?: string;
  resolveHost?: () => string;
  vibeWebPort?: number;
  leaseMs?: number;
};

export function resolveLanHost() {
  const override = process.env.POSTURE_PAIRING_HOST;
  if (override) {
    if (!isIPv4(override)) throw new Error("POSTURE_PAIRING_HOSTにはPCのIPv4アドレスを指定してください。");
    return override;
  }
  const addresses = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? []).filter((entry) => entry.family === "IPv4" && !entry.internal
      && !entry.address.startsWith("169.254.") && !/^(utun|tun|tap|docker|veth)/.test(name))
      .map((entry) => ({ name, address: entry.address })),
  );
  addresses.sort((a, b) => Number(/^(en|eth|wl)/.test(b.name)) - Number(/^(en|eth|wl)/.test(a.name)));
  if (!addresses[0]) throw new Error("PCをスマートフォンと同じWi-Fiに接続してから、QRを更新してください。");
  return addresses[0].address;
}

export async function startBrowserPairingServer(options: BrowserPairingOptions = {}) {
  const token = randomBytes(24).toString("hex");
  const resolveHost = options.resolveHost ?? resolveLanHost;
  const vibeWebPort = options.vibeWebPort ?? Number(process.env.POSTURE_VIBE_WEB_PORT || 8081);
  if (!Number.isInteger(vibeWebPort) || vibeWebPort < 1 || vibeWebPort > 65535) {
    throw new Error("POSTURE_VIBE_WEB_PORTが正しくありません。");
  }
  const leaseMs = options.leaseMs ?? 20_000;
  let port = 0;
  let paired = false;
  let deviceName: string | null = null;
  let lastSeenAt: string | null = null;
  let sequence = 0;
  let isBad = false;
  let session: BrowserSession = { measuring: false, registering: false };
  let leaseTimer: ReturnType<typeof setTimeout> | undefined;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16_384 });

  const status = () => ({ paired, deviceName, lastSeenAt });
  const event = (type: string) => ({
    type, sequence, ...status(), createdAt: new Date().toISOString(),
    measuringSessionActive: session.measuring,
    goodPostureRegistrationActive: session.registering,
  });
  function broadcast(type: string) {
    sequence += 1;
    const payload = JSON.stringify(event(type));
    for (const client of sockets.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }
  function setPosture(nextBad: boolean) {
    if (isBad === nextBad) return;
    isBad = nextBad;
    broadcast(isBad ? "posture_bad" : "posture_good");
  }
  function setSession(next: BrowserSession) {
    const previous = session;
    session = { measuring: next.measuring, registering: next.registering && !next.measuring };
    if (!session.measuring) setPosture(false);
    if (previous.registering !== session.registering) {
      broadcast(session.registering ? "good_posture_registration_started" : "good_posture_registration_stopped");
    }
    if (previous.measuring !== session.measuring) {
      broadcast(session.measuring ? "measuring_started" : "measuring_stopped");
    }
    clearTimeout(leaseTimer);
    if (session.measuring || session.registering) {
      // Stop a stale alert if the browser disappears without sending its final update.
      leaseTimer = setTimeout(() => setSession({ measuring: false, registering: false }), leaseMs);
      leaseTimer.unref();
    }
  }
  function allowedOrigin(origin: string | undefined) {
    if (!origin) return true; // Native Vibe clients do not send Origin.
    try {
      const url = new URL(origin);
      return url.protocol === "http:" && url.port === String(vibeWebPort)
        && [resolveHost(), "localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    } catch {
      return false;
    }
  }
  const validToken = (url: URL) => url.searchParams.get("token") === token;
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (!allowedOrigin(request.headers.origin)) {
      return json(response, 403, { ok: false, errorCode: "FORBIDDEN", message: "接続元が許可されていません。" });
    }
    if (request.headers.origin) {
      response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
      response.setHeader("Vary", "Origin");
    }
    if (request.method !== "GET") return json(response, 405, { ok: false, message: "GETのみ利用できます。" });
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/health") return json(response, 200, { ok: true });
    if (!["/pair", "/disconnect", "/connect"].includes(url.pathname)) {
      return json(response, 404, { ok: false, message: "Not found" });
    }
    if (!validToken(url)) {
      return json(response, 401, { ok: false, errorCode: "INVALID_TOKEN", message: "PCのQRを読み直してください。" });
    }
    if (url.pathname === "/connect") {
      try {
        const target = new URL(`http://${resolveHost()}:${vibeWebPort}/pairing-test`);
        target.search = new URLSearchParams({ host: resolveHost(), port: String(port), token }).toString();
        response.writeHead(302, { Location: target.toString() });
        return response.end();
      } catch (error) {
        return json(response, 503, { ok: false, message: error instanceof Error ? error.message : "接続できません。" });
      }
    }
    if (url.pathname === "/pair") {
      const name = url.searchParams.get("deviceName")?.trim();
      if (!name || name.length > 200) {
        return json(response, 400, { ok: false, errorCode: "MISSING_DEVICE_NAME", message: "端末名が必要です。" });
      }
      paired = true;
      deviceName = name;
      lastSeenAt = new Date().toISOString();
      broadcast("paired");
      return json(response, 200, { ok: true, paired: true, deviceName, pairedAt: lastSeenAt });
    }
    if (paired) {
      paired = false;
      deviceName = null;
      setPosture(false);
      broadcast("disconnected");
      for (const client of sockets.clients) client.close();
    }
    return json(response, 200, { ok: true, paired: false, disconnectedAt: new Date().toISOString() });
  });

  server.on("upgrade", (request, socket, head) => {
    socket.on("error", () => {});
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws" || !validToken(url) || !paired || !allowedOrigin(request.headers.origin)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => {
      client.on("error", () => {});
      client.on("message", () => { lastSeenAt = new Date().toISOString(); });
      client.send(JSON.stringify(event("snapshot")));
      client.send(JSON.stringify(event(isBad ? "posture_bad" : "posture_good")));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, options.listenHost ?? "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("ペアリングサーバーを開始できませんでした。");
  port = address.port;
  let closing: Promise<void> | undefined;
  return {
    getInfo() {
      const host = resolveHost();
      return { host, port, token, browserUrl: `http://${host}:${port}/connect?token=${token}` };
    },
    getStatus: status,
    setPosture,
    setSession,
    close() {
      return closing ??= new Promise<void>((resolve, reject) => {
        clearTimeout(leaseTimer);
        for (const client of sockets.clients) client.terminate();
        sockets.close();
        server.closeAllConnections();
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

export function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}
