import {
  BUILTIN_SOUND_OPTIONS,
  DEFAULT_SOUND_SETTINGS,
  getDefaultSelectedSoundPath,
  SOUND_SETTINGS_STORAGE_KEY,
  type SoundSettings,
} from "../types/soundSettings";

/** 利用可能な選択肢の中から、既定方針（インデックス1優先）で 1 件選ぶ */
function resolvePreferredSelectedSound(availableSounds: Set<string>): string {
  const first = BUILTIN_SOUND_OPTIONS[0];
  const second = BUILTIN_SOUND_OPTIONS[1];
  if (second && availableSounds.has(second)) {
    return second;
  }
  if (first && availableSounds.has(first)) {
    return first;
  }
  return [...availableSounds][0] ?? "";
}

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
    const customSounds = Array.isArray(parsed.customSounds)
      ? Array.from(
          new Set(
            parsed.customSounds.filter(
              (value): value is string => typeof value === "string",
            ),
          ),
        ).slice(0, 10)
      : [];
    const availableSounds = new Set([
      ...BUILTIN_SOUND_OPTIONS,
      ...customSounds,
    ]);
    const requestedSelectedSound =
      typeof parsed.selectedSound === "string" && parsed.selectedSound.length > 0
        ? parsed.selectedSound
        : getDefaultSelectedSoundPath();
    const selectedSound = availableSounds.has(requestedSelectedSound)
      ? requestedSelectedSound
      : resolvePreferredSelectedSound(availableSounds);

    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_SOUND_SETTINGS.enabled,
      volume,
      selectedSound,
      customSounds,
    };
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

export function saveSoundSettings(settings: SoundSettings) {
  try {
    window.localStorage.setItem(
      SOUND_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...settings,
        customSounds: Array.from(new Set(settings.customSounds)).slice(0, 10),
      }),
    );
  } catch {
    // ignore storage failures
  }
}
