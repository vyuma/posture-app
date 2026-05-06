import { normalizeCharacterId } from "./characterIds";

const FAVORITE_CHARACTER_STORAGE_KEY = "posture.characters.favorites.v1";

/** localStorageから「お気に入り」キャラクターIDの集合を読み込む */
export function loadFavoriteCharacterIds(): Set<string> {
  try {
    const rawValue = window.localStorage.getItem(FAVORITE_CHARACTER_STORAGE_KEY);
    if (!rawValue) {
      return new Set();
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return new Set();
    }

    return new Set(
      parsedValue.filter(isString).map((id) => normalizeCharacterId(id)),
    );
  } catch {
    return new Set();
  }
}

export function saveFavoriteCharacterIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(
      FAVORITE_CHARACTER_STORAGE_KEY,
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // Restricted WebView storage is silently ignored.
  }
}

/** 既存の集合からON/OFFを反転させた新しい集合を返す（不変更新） */
export function toggleFavoriteCharacterId(
  ids: Set<string>,
  characterId: string,
): Set<string> {
  const normalizedId = normalizeCharacterId(characterId);
  const next = new Set(ids);

  if (next.has(normalizedId)) {
    next.delete(normalizedId);
  } else {
    next.add(normalizedId);
  }

  return next;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
