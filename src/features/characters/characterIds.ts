// Historical IDs already used by the desktop/mobile apps. Keep both parsers compatible.
const CHARACTER_ID_ALIASES: Record<string, string> = {
  "shin-akao": "shin-anago",
  "kuro-nyago": "kuro-anyago",
  "kuro-anago": "kuro-anyago",
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

export function normalizeCharacterId(characterId: string): string {
  const normalized = characterId.trim().toLowerCase();
  return CHARACTER_ID_ALIASES[normalized] ?? normalized;
}
