const LEGACY_CHARACTER_ID_MAP: Record<string, string> = {
  "shin-akao": "shin-anago",
  "kuro-nyago": "kuro-anyago",
  "hat-nyago": "hat-anago",
  "oto-nyago": "oto-anago",
  "kiri-nago": "dot-nago",
  broccoli: "moja-anago",
};

export function normalizeCharacterId(characterId: string) {
  return LEGACY_CHARACTER_ID_MAP[characterId] ?? characterId;
}
