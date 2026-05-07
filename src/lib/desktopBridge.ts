import { invoke } from "@tauri-apps/api/core";
import type { PairingInfo } from "../features/pairing/types/pairing";

export type DesktopPairingStatus = {
  paired: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
};

export async function getPairingInfo(): Promise<PairingInfo> {
  return invoke<PairingInfo>("get_pairing_info");
}

export async function getPairingStatus(): Promise<DesktopPairingStatus> {
  return invoke<DesktopPairingStatus>("get_pairing_status");
}

export async function sendPostureSignal(isBad: boolean) {
  await invoke("emit_posture_signal", { isBad });
}
