import { invoke, isTauri } from "@tauri-apps/api/core";

import type { PairingInfo } from "../types/pairing";

export type DesktopPairingStatus = {
  paired: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
};

let browserReady = false;
let pendingInfo: Promise<PairingInfo> | undefined;
let browserSession = { measuring: false, registering: false, isBad: false };
let sessionVersion = 0;
let pendingSync: Promise<void> | undefined;

export async function getPairingInfo(): Promise<PairingInfo> {
  if (isTauri()) return invoke<PairingInfo>("get_pairing_info");
  // Initial effects share one request, so a new browser only receives one owner cookie/room.
  return pendingInfo ??= browserRequest<PairingInfo>("info").then((info) => {
    browserReady = true;
    return info;
  }).finally(() => { pendingInfo = undefined; });
}

export async function getDesktopPairingStatus(): Promise<DesktopPairingStatus> {
  if (isTauri()) return invoke<DesktopPairingStatus>("get_pairing_status");
  if (!browserReady) await getPairingInfo();
  return browserRequest<DesktopPairingStatus>("status");
}

export async function sendPostureSignal(isBad: boolean): Promise<void> {
  if (isTauri()) await invoke("emit_posture_signal", { isBad });
  else {
    browserSession = { ...browserSession, isBad };
    await syncLatestBrowserSession();
  }
}

export async function syncBrowserPairingSession(session: { measuring: boolean; registering: boolean }) {
  if (!isTauri()) {
    browserSession = { ...browserSession, ...session };
    await syncLatestBrowserSession();
  }
}

function syncLatestBrowserSession() {
  sessionVersion += 1;
  // Coalesce rapid changes and serialize writes, so a delayed heartbeat cannot undo a pause.
  return pendingSync ??= (async () => {
    if (!browserReady) await getPairingInfo();
    let sentVersion: number;
    do {
      sentVersion = sessionVersion;
      const state = { ...browserSession, isBad: browserSession.measuring && browserSession.isBad };
      await browserRequest("session", state);
    } while (sentVersion !== sessionVersion);
  })().finally(() => { pendingSync = undefined; });
}

async function browserRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/pairing/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "X-Posture-Client": "browser", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      keepalive: body !== undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("接続サーバーに到達できません。通信状態を確認してください。");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("このページではスマートフォン連携を利用できません。");
  }
  const payload = await response.json();
  if (response.status === 401) browserReady = false;
  if (!response.ok) throw new Error(payload.message ?? "接続情報を取得できませんでした。もう一度お試しください。");
  return payload as T;
}
