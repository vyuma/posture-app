import type {
  PostureFeatures,
  PostureState,
  ViewClass,
} from "./engine";

export type AlertDisplayMode = "blackout" | "debug";
export type TrackingMode = "foreground" | "background";

export type RuntimeSnapshot = {
  postureState: PostureState;
  qualityOk: boolean;
  view: ViewClass;
  score: number;
  candidateBad: boolean;
  warmupRemainingMs: number;
  baselineReady: boolean;
  usingWorldLandmarks: boolean;
  features: PostureFeatures | null;
  trackingMode: TrackingMode;
  trackingIntervalMs: number;
};
