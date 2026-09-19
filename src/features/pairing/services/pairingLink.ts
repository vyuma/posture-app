import type { PairingInfo } from "../types/pairing";

export function buildPairingLink(pairingInfo: PairingInfo | null): string {
  if (!pairingInfo) {
    return "";
  }

  if (pairingInfo.browserUrl) return pairingInfo.browserUrl;

  const params = new URLSearchParams({
    host: pairingInfo.host,
    port: String(pairingInfo.port),
    token: pairingInfo.token,
  });

  return `vibeapp://pair?${params.toString()}`;
}
