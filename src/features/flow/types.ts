export type AppFlowPhase =
  | "onboarding"
  | "home"
  | "qrScanned"
  | "measuring"
  | "postureRegistered";

export type RewardRule = {
  minDurationMs: number;
  minGoodRatio: number;
};

export type MeasurementStats = {
  activeMeasurementMs: number;
  goodMs: number;
  goodRatio: number;
};

/** 測定の「アクティブ時間」軸上の区間（warmup / pause 中は伸びない） */
export type PostureTimelineSegment = {
  startMs: number;
  endMs: number;
  isGood: boolean;
};

export type MeasurementResult = MeasurementStats & {
  id: string;
  startedAt: string;
  endedAt: string;
  rewardQualified: boolean;
  acquiredCharacterId: string | null;
  postureTimeline: PostureTimelineSegment[];
};

export type PostureRegisterStep = "intro" | "calibrating" | "settings";
