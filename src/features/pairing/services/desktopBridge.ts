import { invoke } from "@tauri-apps/api/core";

import type { PairingInfo } from "../types/pairing";

export type DesktopPairingStatus = {
  paired: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
};

export async function getPairingInfo(): Promise<PairingInfo> {
  return invoke<PairingInfo>("get_pairing_info");
}

export async function getDesktopPairingStatus(): Promise<DesktopPairingStatus> {
  return invoke<DesktopPairingStatus>("get_pairing_status");
}

export async function sendPostureSignal(isBad: boolean): Promise<void> {
  await invoke("emit_posture_signal", { isBad });
}
