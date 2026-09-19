import type { IncomingMessage } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { json, startBrowserPairingServer, type BrowserPairingOptions } from "./browser-pairing-server";

export function browserPairingPlugin(options: BrowserPairingOptions = {}): Plugin {
  function configure(server: ViteDevServer | PreviewServer) {
    let relay: ReturnType<typeof startBrowserPairingServer> | undefined;
    const getRelay = () => relay ??= startBrowserPairingServer(options).catch((error) => {
      relay = undefined;
      throw error;
    });
    server.httpServer?.once("close", () => { void relay?.then((value) => value.close()).catch(() => {}); });
    server.middlewares.use(async (request, response, next) => {
      const path = request.url?.split("?")[0];
      if (!path?.startsWith("/api/pairing/")) return next();
      // Browser controls stay on the local Vite origin; only the token-protected phone API is on the LAN.
      const remote = request.socket.remoteAddress;
      const origin = request.headers.origin;
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote ?? "")
        || request.headers["x-posture-client"] !== "browser"
        || request.headers["sec-fetch-site"] === "cross-site"
        || (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`)) {
        return json(response, 403, { message: "PCのlocalhostから開いてください。" });
      }
      try {
        const pairing = await getRelay();
        if (request.method === "GET" && path === "/api/pairing/info") {
          return json(response, 200, pairing.getInfo());
        }
        if (request.method === "GET" && path === "/api/pairing/status") {
          return json(response, 200, pairing.getStatus());
        }
        if (request.method === "POST") {
          const body = await readBody(request).catch(() => null);
          if (!body) return json(response, 400, { message: "送信内容が正しくありません。" });
          if (path === "/api/pairing/posture" && typeof body.isBad === "boolean") {
            pairing.setPosture(body.isBad);
            return json(response, 200, { ok: true });
          }
          if (path === "/api/pairing/session" && typeof body.measuring === "boolean" && typeof body.registering === "boolean") {
            if (body.isBad !== undefined && typeof body.isBad !== "boolean") {
              return json(response, 400, { message: "送信内容が正しくありません。" });
            }
            pairing.setSession({ measuring: body.measuring, registering: body.registering });
            if (typeof body.isBad === "boolean") pairing.setPosture(body.measuring && body.isBad);
            return json(response, 200, { ok: true });
          }
          return json(response, 400, { message: "送信内容が正しくありません。" });
        }
        return json(response, 404, { message: "Not found" });
      } catch (error) {
        return json(response, 503, { message: error instanceof Error ? error.message : "接続情報を取得できませんでした。" });
      }
    });
  }
  return { name: "browser-pairing", configureServer: configure, configurePreviewServer: configure };
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("JSONが必要です。");
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 4096) throw new Error("送信内容が大きすぎます。");
  }
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("送信内容が正しくありません。");
  return parsed as Record<string, unknown>;
}
