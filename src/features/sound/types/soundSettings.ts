import { SOUND_OPTIONS } from "virtual:sound-options";

export type SoundSettings = {
  enabled: boolean;
  volume: number; // 0..1
  selectedSound: string;
  customSounds: string[];
};

export const SOUND_SETTINGS_STORAGE_KEY = "posture.sound.settings.v1";

export const BUILTIN_SOUND_OPTIONS = SOUND_OPTIONS;

/**
 * public/sounds のファイル名昇順（Vite virtual:sound-options）。既定は 2 番目（インデックス1）。
 * 1 件しか無いときは [0]。
 */
export function getDefaultSelectedSoundPath(): string {
  return BUILTIN_SOUND_OPTIONS[1] ?? BUILTIN_SOUND_OPTIONS[0] ?? "";
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.7,
  selectedSound: getDefaultSelectedSoundPath(),
  customSounds: [],
};
