const PROFILE_CHARACTER_STORAGE_KEY = "posture.characters.profile.v1";

export function loadSelectedProfileCharacterId(): string | null {
  try {
    const storedValue = window.localStorage.getItem(PROFILE_CHARACTER_STORAGE_KEY);
    return storedValue && storedValue.length > 0 ? storedValue : null;
  } catch {
    return null;
  }
}

export function saveSelectedProfileCharacterId(characterId: string | null) {
  try {
    if (characterId) {
      window.localStorage.setItem(PROFILE_CHARACTER_STORAGE_KEY, characterId);
      return;
    }

    window.localStorage.removeItem(PROFILE_CHARACTER_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}
