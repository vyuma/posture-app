import { invoke } from "@tauri-apps/api/core";

import type { CharacterColor } from "../../characters/types";
import type { PairingInfo } from "../types/pairing";
import type { PostureTimelineSegment } from "../../flow/types";

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

/** スマホの「測定中」表示と同期する。フローが measuring の間 true。 */
export async function syncPairingMeasuringSession(active: boolean): Promise<void> {
  await invoke("sync_pairing_measuring_session", { active });
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
  /** PC の `AcquiredCharacter.postureTimeline` と同一 */
  postureTimeline?: PostureTimelineSegment[];
  story?: string;
  portraitSrc?: string;
  personalityTags?: string[];
  characterColor?: CharacterColor;
  toneClass?: string;
};

export async function sendAcquiredCharactersCleared(): Promise<void> {
  await invoke("emit_acquired_characters_cleared");
}

export async function sendAcquiredCharacterEvent(
  input: AcquiredCharacterEventInput,
): Promise<void> {
  await invoke("emit_acquired_character_event", { input });
}
