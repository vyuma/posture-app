import type { PairingInfo } from "../types/pairing";

export function buildPairingLink(pairingInfo: PairingInfo | null): string {
  if (!pairingInfo) {
    return "";
  }

  const params = new URLSearchParams({
    host: pairingInfo.host,
    port: String(pairingInfo.port),
    token: pairingInfo.token,
  });

  return `vibeapp://pair?${params.toString()}`;
}

/**
 * 同一 Wi‑Fi 上のブラウザでミラー UI を開く URL（`RemotePairingApp`）。
 * `origin` 例: http://192.168.1.3:5173（Vite dev）または配信ドメイン。
 */
export function buildWebRemoteMirrorUrl(
  pairingInfo: PairingInfo | null,
  origin: string,
): string {
  if (!pairingInfo) {
    return "";
  }
  const base = origin.replace(/\/$/, "");
  const params = new URLSearchParams({
    remotePair: "1",
    host: pairingInfo.host,
    port: String(pairingInfo.port),
    token: pairingInfo.token,
  });
  return `${base}/?${params.toString()}`;
}
