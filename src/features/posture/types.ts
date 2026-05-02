import type {
  PostureFeatures,
  PostureState,
  ViewClass,
  YawGateState,
} from "./engine";

export type AlertDisplayMode = "blackout" | "debug";

export type RuntimeSnapshot = {
  postureState: PostureState;
  qualityOk: boolean;
  view: ViewClass;
  score: number;
  candidateBad: boolean;
  yawGate: YawGateState;
  yawProxy: number;
  headScale: number;
  warmupRemainingMs: number;
  baselineReady: boolean;
  usingWorldLandmarks: boolean;
  features: PostureFeatures | null;
};
