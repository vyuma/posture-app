import type { CharacterDefinition, CharacterExpression } from "./types";

/** 実ファイルは PNG（.svg は未配置のため 404 になる） */
const NORMAL_NAGO_EXPRESSIONS = {
  good: "/characters/anago/normal-nago/expressions/good.png",
  bad: "/characters/anago/normal-nago/expressions/bad.png",
  paused: "/characters/anago/normal-nago/expressions/paused.png",
  happy: "/characters/anago/normal-nago/expressions/happy.png",
} satisfies Partial<Record<CharacterExpression, string>>;

export const CHARACTER_CATALOG: CharacterDefinition[] = [
  {
    id: "normal-nago",
    name: "シマアナゴ",
    rarity: "common",
    story: "いつもそばで姿勢を見守ってくれる、基本のピンアナゴ。",
    portraitSrc: "/characters/anago/normal-nago/portrait.png",
    expressions: NORMAL_NAGO_EXPRESSIONS,
    characterColor: {
      primary: "#f28a18",
      soft: "#f8d7b2",
    },
    personalityTags: ["ムードメーカー", "フレンドリー"],
  },
  {
    id: "shin-anago",
    name: "シン・アナゴ",
    rarity: "common",
    story: "姿勢のいい時間にひょっこり現れる、まっすぐなピンアナゴ。",
    portraitSrc: "/characters/anago/shin-anago/portrait.png",
    characterColor: {
      primary: "#f05a63",
      soft: "#f6d2d4",
    },
    personalityTags: ["頑張り屋さん", "負けず嫌い"],
  },
  {
    id: "kuro-anyago",
    name: "クロアニャゴ",
    rarity: "common",
    story: "集中している人のそばが好きな、落ち着いた黒いピンアナゴ。",
    portraitSrc: "/characters/anago/kuro-anyago/portrait.png",
    characterColor: {
      primary: "#555c66",
      soft: "#cfd1d4",
    },
    personalityTags: ["クール", "ツンデレ"],
  },
  {
    id: "hat-anago",
    name: "ハットナゴ",
    rarity: "rare",
    story: "休憩と集中の切り替えが上手な、おしゃれ好きのピンアナゴ。",
    portraitSrc: "/characters/anago/hat-anago/portrait.png",
    characterColor: {
      primary: "#1677c8",
      soft: "#c8dbee",
    },
    personalityTags: ["しっかり者", "リーダー気質"],
  },
  {
    id: "oto-anago",
    name: "オトアナゴ",
    rarity: "common",
    story: "良い姿勢のリズムに合わせてゆらゆらする白いピンアナゴ。",
    portraitSrc: "/characters/anago/oto-anago/portrait.png",
    characterColor: {
      primary: "#777777",
      soft: "#f1f1ef",
    },
    personalityTags: ["音楽好き", "クリエイティブ"],
  },
  {
    id: "dot-nago",
    name: "クマアナゴ",
    rarity: "rare",
    story: "ドット模様と一緒に、集中のリズムを刻むピンアナゴ。",
    portraitSrc: "/characters/anago/dot-nago/portrait.png",
    characterColor: {
      primary: "#d4aa20",
      soft: "#f1e9bf",
    },
    personalityTags: ["おっとり", "天然"],
  },
  {
    id: "moja-anago",
    name: "モジャアナゴ",
    rarity: "epic",
    story: "良い姿勢を続ける人にだけ姿を見せる、もじゃもじゃ不思議なピンアナゴ。",
    portraitSrc: "/characters/anago/moja-anago/portrait.png",
    characterColor: {
      primary: "#36a25d",
      soft: "#c9ead2",
    },
    personalityTags: ["くせもの", "こだわり強い"],
  },
];

export function getNextUnacquiredCharacter(
  acquiredCharacterIds: Set<string>,
): CharacterDefinition | null {
  return (
    CHARACTER_CATALOG.find((character) => !acquiredCharacterIds.has(character.id)) ??
    null
  );
}

export function getCharacterImageSrc(
  character: CharacterDefinition,
  expression?: CharacterExpression,
) {
  if (expression) {
    return character.expressions?.[expression] ?? character.portraitSrc;
  }

  return character.portraitSrc;
}
