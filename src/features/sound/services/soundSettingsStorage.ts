import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_SETTINGS_STORAGE_KEY,
  type SoundSettings,
} from "../types/soundSettings";

export function loadSoundSettings(): SoundSettings {
  try {
    const raw = window.localStorage.getItem(SOUND_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SOUND_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    const volume =
      typeof parsed.volume === "number"
        ? Math.max(0, Math.min(1, parsed.volume))
        : DEFAULT_SOUND_SETTINGS.volume;

    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_SOUND_SETTINGS.enabled,
      volume,
      selectedSound:
        typeof parsed.selectedSound === "string" && parsed.selectedSound.length > 0
          ? parsed.selectedSound
          : DEFAULT_SOUND_SETTINGS.selectedSound,
      customSounds: Array.isArray(parsed.customSounds)
        ? parsed.customSounds.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

export function saveSoundSettings(settings: SoundSettings) {
  try {
    window.localStorage.setItem(SOUND_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage failures
  }
}
