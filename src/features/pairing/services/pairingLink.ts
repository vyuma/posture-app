import type { PairingInfo } from "../types/pairing";

export function buildPairingLink(pairingInfo: PairingInfo | null): string {
  if (!pairingInfo) {
    return "";
  }

  return `vibeapp://pair?host=${pairingInfo.host}&port=${pairingInfo.port}&token=${pairingInfo.token}`;
}

export function buildPairingQrImageUrl(pairingLink: string): string {
  if (!pairingLink) {
    return "";
  }

  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    pairingLink,
  )}`;
}
