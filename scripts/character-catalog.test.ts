import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CHARACTER_CATALOG, getCharacterAtSlotIndex, getCharacterImageSrc } from '../src/features/characters/characterCatalog';
import { getCharacterGrade } from '../src/features/characters/CharacterStars';
import { numberOf, characterSpeech } from '../src/features/work/CharacterCard';
import { chooseReward, type Card } from '../src/features/work/model';
import additions from '../src/features/characters/characterAdditions.json';

test('sparse collection numbers cannot shift cards or fill unreleased slots', () => {
  expect(new Set(CHARACTER_CATALOG.map(c => c.number)).size).toBe(CHARACTER_CATALOG.length);
  expect(new Set(CHARACTER_CATALOG.map(c => c.id)).size).toBe(CHARACTER_CATALOG.length);
  for (const entry of additions) {
    expect(getCharacterAtSlotIndex(entry.number - 1)?.id).toBe(entry.id);
    expect(numberOf(entry.id)).toBe(String(entry.number).padStart(3, '0'));
    expect(getCharacterGrade(entry.id)?.stars).toBe(entry.stars);
    expect(characterSpeech(entry.id)).toBe(entry.presentation.pickerSpeech);
    const png = readFileSync(`public${getCharacterImageSrc(CHARACTER_CATALOG.find(c => c.id === entry.id)!, 'bad')}`);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  }
  for (const number of [18, 40, 42, 74, 76, 91, 93, 111]) expect(getCharacterAtSlotIndex(number - 1)).toBeUndefined();
  expect(getCharacterAtSlotIndex(0)?.id).toBe('normal-nago');
  expect(getCharacterGrade('moja-anago')?.stars).toBe(1); // legacy epic is not star grade
});

test('completed legacy collections can obtain every new character once, without changing first reward', () => {
  const ids = CHARACTER_CATALOG.map(c => c.id);
  const cards: Card[] = CHARACTER_CATALOG.filter(c => c.number <= 17).map(c => ({ characterId: c.id, measurementId: c.id, acquiredAt: '2026-10-29', generation: 0 }));
  expect(chooseReward([], ids)).toBe('normal-nago');
  const remaining = additions.map(c => c.id);
  for (const expected of remaining) {
    const next = chooseReward(cards, ids, () => 0);
    expect(next).toBe(expected);
    cards.push({ characterId: next!, measurementId: next!, acquiredAt: '2026-10-29', generation: 0 });
  }
  expect(chooseReward(cards, ids)).toBeNull();
  expect(cards).toHaveLength(20);
});
