import type { CharacterDefinition } from "./types";

/** Story 6/6 and the LP share these presentation overrides. Domain data lives in characterCatalog.ts. */
export type StoryCharacterCardPresentation = {
  imageSrc?: string;
  characterId: CharacterDefinition["id"];
  displayName: string;
  personalityTags: readonly [string, string];
  xPercent: number;
  bottomPercent: number;
  scaleX: number;
  scaleY: number;
  primaryColor: string;
  previewColor: string;
};

export const STORY_CHARACTER_CARDS: StoryCharacterCardPresentation[] = [
  {
    imageSrc: "/figma/story-nasubi.png",
    characterId: "nasubi-nago",
    displayName: "ナスビナゴ",
    personalityTags: ["落ち着きがある", "お兄ちゃんキャラ"],
    xPercent: 50,
    bottomPercent: 0,
    scaleX: 1,
    scaleY: 1,
    primaryColor: "#715ba3",
    previewColor: "#e3deed",
  },
  {
    characterId: "shin-anago",
    displayName: "シン・アナゴ",
    personalityTags: ["頑張り屋さん", "負けず嫌い"],
    xPercent: 49.5,
    bottomPercent: -40,
    scaleX: 0.68,
    scaleY: 0.68,
    primaryColor: "#ea4949",
    previewColor: "rgba(234, 73, 73, 0.2)",
  },
  {
    characterId: "oto-anago",
    displayName: "オトアナゴ",
    personalityTags: ["音楽好き", "クリエイティブ"],
    xPercent: 55.8,
    bottomPercent: -33,
    scaleX: 0.646,
    scaleY: 0.646,
    primaryColor: "#505050",
    previewColor: "#f8f8f8",
  },
  {
    characterId: "kuro-anyago",
    displayName: "クロアニャゴ",
    personalityTags: ["クール", "ツンデレ"],
    xPercent: 49.5,
    bottomPercent: -68.5,
    scaleX: 0.82,
    scaleY: 0.82,
    primaryColor: "#3b424f",
    previewColor: "#d8d9dc",
  },
  {
    characterId: "dot-nago",
    displayName: "クマアナゴ",
    personalityTags: ["おっとり", "天然"],
    xPercent: 52.35,
    bottomPercent: -56,
    scaleX: 0.733,
    scaleY: 0.733,
    primaryColor: "#e0bf00",
    previewColor: "#f9f2cc",
  },
  {
    characterId: "moja-anago",
    displayName: "モジャアナゴ",
    personalityTags: ["くせもの", "こだわり強い"],
    xPercent: 51.35,
    bottomPercent: -50.3,
    scaleX: 0.71,
    scaleY: 0.71,
    primaryColor: "#00962e",
    previewColor: "#ccead5",
  },
  {
    characterId: "hat-anago",
    displayName: "ハットナゴ",
    personalityTags: ["しっかり者", "リーダー気質"],
    xPercent: 55.31,
    bottomPercent: -60.8,
    scaleX: 0.807,
    scaleY: 0.793,
    primaryColor: "#0055aa",
    previewColor: "#ccddee",
  },
  {
    imageSrc: "/figma/story-twin.png",
    characterId: "twin-nago",
    displayName: "ツインナゴ",
    personalityTags: ["アイドル気質", "妹キャラ"],
    xPercent: 50,
    bottomPercent: 0,
    scaleX: 1,
    scaleY: 1,
    primaryColor: "#ed8cc4",
    previewColor: "#fbe8f3",
  },
];
