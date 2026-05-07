import { SOUND_OPTIONS } from "virtual:sound-options";

export type SoundSettings = {
  enabled: boolean;
  volume: number; // 0..1
  selectedSound: string;
  customSounds: string[];
};

export const SOUND_SETTINGS_STORAGE_KEY = "posture.sound.settings.v1";

export const BUILTIN_SOUND_OPTIONS = SOUND_OPTIONS;

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.7,
  selectedSound: BUILTIN_SOUND_OPTIONS[0] ?? "",
  customSounds: [],
};
