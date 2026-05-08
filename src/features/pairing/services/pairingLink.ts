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
