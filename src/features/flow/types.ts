export type AppFlowPhase =
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

export type MeasurementResult = MeasurementStats & {
  id: string;
  startedAt: string;
  endedAt: string;
  rewardQualified: boolean;
  acquiredCharacterId: string | null;
};
