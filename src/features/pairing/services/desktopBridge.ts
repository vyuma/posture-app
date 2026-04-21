import { invoke } from "@tauri-apps/api/core";

import type { PairingInfo, VibrationPattern } from "../types/pairing";

export type DesktopPairingStatus = {
  paired: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
  lastSequence: number;
};

export async function getPairingInfo(): Promise<PairingInfo> {
  return invoke<PairingInfo>("get_pairing_info");
}

export async function getDesktopPairingStatus(): Promise<DesktopPairingStatus> {
  return invoke<DesktopPairingStatus>("get_pairing_status");
}

export async function triggerMobileVibration(
  pattern: VibrationPattern = "short",
): Promise<void> {
  await invoke("trigger_mobile_vibration", { pattern });
}
