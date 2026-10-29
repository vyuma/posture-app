import type { FeedbackObservation } from "./feedback";
import type {
  PostureExperimentMetrics,
  PostureFeatures,
  PostureState,
  ViewClass,
  TrackingStatus,
} from "./engine.types";

export type TrackingMode = "foreground" | "background";

export type PostureExperimentSample = {
  timestampMs: number;
  neckAngle2dFallback: number | null;
  neckAngle3d: number | null;
};

export type RuntimeSnapshot = {
  trackingStatus?: TrackingStatus;
  presentationPosture?: PostureState;
  observedAtMs?: number;
  feedback?: FeedbackObservation;
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
