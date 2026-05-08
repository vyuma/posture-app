export type AppFlowPhase =
  | "onboarding"
  | "home"
  | "mobileConnect"
  | "qrScanned"
  | "postureRegister"
  | "measuring"
  | "postureRegistered";

/** 姿勢登録（基準線）フロー内の画面段階 */
export type PostureRegisterStep = "intro" | "calibrating" | "settings";

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
