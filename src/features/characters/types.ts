import type { PostureTimelineSegment } from "../flow/types";

export type CharacterRarity = "common" | "rare" | "epic" | "ultra-rare";
export type CharacterExpression = "good" | "bad" | "paused" | "happy";

export type CharacterExpressionMap = Partial<
  Record<CharacterExpression, string>
>;

export type CharacterColor = {
  primary: string;
  soft: string;
};

export type CharacterDefinition = {
  id: string;
  number: number;
  name: string;
  rarity: CharacterRarity;
  story: string;
  portraitSrc: string;
  expressions?: CharacterExpressionMap;
  toneClass?: string;
  characterColor: CharacterColor;
  personalityTags: string[];
};

export type AcquiredCharacter = {
  characterId: string;
  acquiredAt: string;
  measurementId: string;
  activeMeasurementMs?: number;
  goodMs?: number;
  goodRatio?: number;
  postureTimeline?: PostureTimelineSegment[];
};
