const LEGACY_CHARACTER_ID_MAP: Record<string, string> = {
  "shin-akao": "shin-anago",
  "kuro-nyago": "kuro-anyago",
  "hat-nyago": "hat-anago",
  "oto-nyago": "oto-anago",
  "kiri-nago": "dot-nago",
  broccoli: "moja-anago",
  "mimi-anago": "wan-anago",
  "aka-anago": "koi-anago",
  "hoshi-anago": "yozora-nago",
  "futaba-anago": "futaba-nago",
  "caramel-anago": "pan-nago",
  "rabu-anago": "twin-nago",
  "nasu-anago": "nasubi-nago",
};

export function normalizeCharacterId(characterId: string) {
  return LEGACY_CHARACTER_ID_MAP[characterId] ?? characterId;
}
