export type ViewClass = "front" | "side" | "unknown";

export type PostureFeatures = {
  headLateralOffsetRatio: number;
  earShoulderDistanceRatio: number;
  torsoTiltDeg: number;
  neckAngleDeg: number;
  earShoulderAsymmetryRatio: number;
  headForwardAngleDeg: number | null;
};

export type PostureState = "good" | "bad" | "hold";

export type PostureEval = {
  score: number;
  candidateBad: boolean;
  qualityOk: boolean;
  view: ViewClass;
  isHeadTurned: boolean;
  headYawRatio: number | null;
  headWidthRatio: number | null;
  headWidthScale: number | null;
  headWidthScoreBoost: number;
};

export type PostureExperimentSourceQuality =
  | "world"
  | "image"
  | "mixed"
  | "missing-hips"
  | "vertical-fallback"
  | "insufficient";

export type PostureExperimentProxyPoint = {
  y: number;
  z: number;
  visibility: number;
};

export type PostureExperimentProxy = {
  nose: PostureExperimentProxyPoint;
  earMidpoint: PostureExperimentProxyPoint;
  shoulderMidpoint: PostureExperimentProxyPoint;
  hipMidpoint: PostureExperimentProxyPoint | null;
};

export type PostureExperimentMetrics = {
  neckAngle2dFallback: number | null;
  neckAngle3d: number | null;
  headForwardAngleDeg: number | null;
  sourceQuality: PostureExperimentSourceQuality;
  proxy: PostureExperimentProxy | null;
};

export type FeatureKey = keyof PostureFeatures;
export type BodyTurnSource = "world" | "image";
export type FeatureReliabilityMap = Record<FeatureKey, number>;

export type FeatureStats = {
  median: number;
  mad: number;
  scale: number;
  sampleCount: number;
};

export type BaselineStats = Record<FeatureKey, FeatureStats>;

export type Point3 = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type ExtractedPoints = {
  N: Point3;
  EL: Point3;
  ER: Point3;
  SL: Point3;
  SR: Point3;
};

export type PickedPoint = {
  point: Point3;
  source: "world" | "image";
};

export type LandmarkSelection = {
  N: PickedPoint | null;
  EL: PickedPoint | null;
  ER: PickedPoint | null;
  SL: PickedPoint | null;
  SR: PickedPoint | null;
  HL: PickedPoint | null;
  HR: PickedPoint | null;
};

export type ExtractFeatureResult =
  | {
      qualityOk: true;
      features: PostureFeatures;
      points2d: ExtractedPoints;
      points3d: ExtractedPoints | null;
      usingWorldLandmarks: boolean;
    }
  | {
      qualityOk: false;
      features: null;
      points2d: ExtractedPoints | null;
      points3d: ExtractedPoints | null;
      usingWorldLandmarks: boolean;
    };

export type ScoreResult = {
  scoreEma: number;
  headWidthScale: number | null;
  headWidthScoreBoost: number;
  confidence: number;
  usableFeatureCount: number;
};

export type NormalizedFeatureMap = Record<FeatureKey, number | null>;

export type PostureFrameResult = {
  eval: PostureEval;
  features: PostureFeatures | null;
  postureState: PostureState;
  warmupRemainingMs: number;
  baselineReady: boolean;
  usingWorldLandmarks: boolean;
  experiment: PostureExperimentMetrics;
};

export type PostureEngineState = {
  warmupStartMs: number | null;
  warmupSamples: Record<FeatureKey, number[]>;
  headWidthWarmupSamples: number[];
  baseline: BaselineStats | null;
  baselineHeadWidthRatio: number | null;
  emaScore: number | null;
  candidateBadState: boolean;
  shoulderEstablished: boolean;
  shoulderDropActive: boolean;
  shoulderMissingAccumMs: number;
  shoulderRecoveryAccumMs: number;
  shoulderDropLastTsMs: number | null;
  stableState: Exclude<PostureState, "hold">;
  postureState: PostureState;
  badAccumMs: number;
  goodAccumMs: number;
  lastTsMs: number | null;
};
