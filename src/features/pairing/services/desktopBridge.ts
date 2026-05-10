import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "../../../lib/tauriRuntime";
import type { CharacterColor } from "../../characters/types";
import type { PairingInfo } from "../types/pairing";

export type DesktopPairingStatus = {
  paired: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
  /** アクティブな WebSocket クライアント数 */
  wsClientCount: number;
};

/** ブラウザ単体実行時（Tauri 外）のダミー状態 */
export const WEB_DESKTOP_PAIRING_STATUS: DesktopPairingStatus = {
  paired: false,
  deviceName: null,
  lastSeenAt: null,
  wsClientCount: 0,
};

export async function getPairingInfo(): Promise<PairingInfo> {
  if (!isTauriRuntime()) {
    throw new Error("Tauri runtime is not available.");
  }
  return invoke<PairingInfo>("get_pairing_info");
}

export async function getDesktopPairingStatus(): Promise<DesktopPairingStatus> {
  if (!isTauriRuntime()) {
    return WEB_DESKTOP_PAIRING_STATUS;
  }
  return invoke<DesktopPairingStatus>("get_pairing_status");
}

export async function disconnectPairingDevice(): Promise<DesktopPairingStatus> {
  if (!isTauriRuntime()) {
    return WEB_DESKTOP_PAIRING_STATUS;
  }
  return invoke<DesktopPairingStatus>("disconnect_pairing_device");
}

export async function sendPostureSignal(isBad: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("emit_posture_signal", { isBad });
}

/** スマホの「測定中」表示と同期する（本番の測定フローのみ）。 */
export async function syncPairingMeasuringSession(active: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("sync_pairing_measuring_session", { active });
}

/** スマホの「良い姿勢を登録中」表示と同期する（姿勢登録フローのキャリブレーション以降）。 */
export async function syncPairingGoodPostureRegistration(
  active: boolean,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("sync_pairing_good_posture_registration", { active });
}

export type AcquiredCharacterEventInput = {
  measurementId: string;
  acquiredAt: string;
  characterId: string;
  characterName: string;
  rarity: string;
  activeMeasurementMs?: number;
  goodMs?: number;
  goodRatio?: number;
  story?: string;
  portraitSrc?: string;
  personalityTags?: string[];
  characterColor?: CharacterColor;
  toneClass?: string;
};

export async function sendAcquiredCharactersCleared(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("emit_acquired_characters_cleared");
}

export async function sendAcquiredCharacterEvent(
  input: AcquiredCharacterEventInput,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("emit_acquired_character_event", { input });
}
