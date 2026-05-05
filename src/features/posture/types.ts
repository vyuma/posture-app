import type {
  PostureExperimentMetrics,
  PostureFeatures,
  PostureState,
  ViewClass,
} from "./engine.types";

export type TrackingMode = "foreground" | "background";

export type PostureExperimentSample = {
  timestampMs: number;
  neckAngle2dFallback: number | null;
  neckAngle3d: number | null;
};

export type RuntimeSnapshot = {
  postureState: PostureState;
  qualityOk: boolean;
  view: ViewClass;
  isHeadTurned: boolean;
  headYawRatio: number | null;
  score: number;
  candidateBad: boolean;
  warmupRemainingMs: number;
  baselineReady: boolean;
  usingWorldLandmarks: boolean;
  features: PostureFeatures | null;
  headWidthRatio: number | null;
  headWidthScale: number | null;
  headWidthScoreBoost: number;
  trackingMode: TrackingMode;
  trackingIntervalMs: number;
  experiment: PostureExperimentMetrics;
};
