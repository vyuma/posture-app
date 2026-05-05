import type { AcquiredCharacter } from "./types";

const ACQUIRED_CHARACTERS_STORAGE_KEY = "posture.characters.acquired.v1";
const LEGACY_CHARACTER_ID_MAP: Record<string, string> = {
  "shin-akao": "shin-anago",
  "kuro-nyago": "kuro-anyago",
  "hat-nyago": "hat-anago",
  "oto-nyago": "oto-anago",
};

export function loadAcquiredCharacters(): AcquiredCharacter[] {
  try {
    const rawValue = window.localStorage.getItem(ACQUIRED_CHARACTERS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return dedupeAcquiredCharacters(
      parsedValue.filter(isAcquiredCharacter).map(normalizeAcquiredCharacter),
    );
  } catch {
    return [];
  }
}

export function saveAcquiredCharacters(characters: AcquiredCharacter[]) {
  try {
    window.localStorage.setItem(
      ACQUIRED_CHARACTERS_STORAGE_KEY,
      JSON.stringify(characters),
    );
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

export function clearAcquiredCharacters() {
  try {
    window.localStorage.removeItem(ACQUIRED_CHARACTERS_STORAGE_KEY);
    window.localStorage.setItem(ACQUIRED_CHARACTERS_STORAGE_KEY, "[]");
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

function isAcquiredCharacter(value: unknown): value is AcquiredCharacter {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.characterId === "string" &&
    typeof candidate.acquiredAt === "string" &&
    typeof candidate.measurementId === "string" &&
    isOptionalNumber(candidate.activeMeasurementMs) &&
    isOptionalNumber(candidate.goodMs) &&
    isOptionalNumber(candidate.goodRatio)
  );
}

function normalizeAcquiredCharacter(
  character: AcquiredCharacter,
): AcquiredCharacter {
  return {
    ...character,
    characterId:
      LEGACY_CHARACTER_ID_MAP[character.characterId] ?? character.characterId,
  };
}

function dedupeAcquiredCharacters(characters: AcquiredCharacter[]) {
  const seenCharacterIds = new Set<string>();

  return characters.filter((character) => {
    if (seenCharacterIds.has(character.characterId)) {
      return false;
    }

    seenCharacterIds.add(character.characterId);
    return true;
  });
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}
