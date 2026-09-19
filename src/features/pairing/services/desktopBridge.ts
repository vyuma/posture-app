import type { CharacterColor } from "../../characters/types";
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

/** スマホの「測定中」表示と同期する（本番の測定フローのみ）。 */
export async function syncPairingMeasuringSession(active: boolean, measurementId: string | null): Promise<void> {
  await invoke("sync_pairing_measuring_session", { active, measurementId });
}

/** スマホの「良い姿勢を登録中」表示と同期する（姿勢登録フローのキャリブレーション以降）。 */
export async function syncPairingGoodPostureRegistration(
  active: boolean,
): Promise<void> {
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
  postureTimeline?: { startMs: number; endMs: number; isGood: boolean }[];
};

export async function sendAcquiredCharactersCleared(): Promise<void> {
  await invoke("emit_acquired_characters_cleared");
}

export async function sendAcquiredCharacterEvent(
  input: AcquiredCharacterEventInput,
): Promise<void> {
  await invoke("emit_acquired_character_event", { input });
}
