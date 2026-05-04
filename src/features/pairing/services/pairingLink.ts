import type { PairingInfo } from "../types/pairing";

export function buildPairingLink(pairingInfo: PairingInfo | null): string {
  if (!pairingInfo) {
    return "";
  }

  return `vibeapp://pair?host=${pairingInfo.host}&port=${pairingInfo.port}&token=${pairingInfo.token}`;
}
