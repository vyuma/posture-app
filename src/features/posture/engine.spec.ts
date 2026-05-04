import type { FeatureKey, PostureExperimentMetrics } from "./engine.types";

export const FEATURE_KEYS: FeatureKey[] = [
  "headLateralOffsetRatio",
  "earShoulderDistanceRatio",
  "torsoTiltDeg",
  "neckAngleDeg",
  "earShoulderAsymmetryRatio",
  "headForwardAngleDeg",
];

export const EMPTY_POSTURE_EXPERIMENT: PostureExperimentMetrics = {
  neckAngle2dFallback: null,
  neckAngle3d: null,
  noseShoulderZDelta: null,
  headForwardAngleDeg: null,
  sourceQuality: "insufficient",
  proxy: null,
};

export const POSTURE_SPEC = {
  visibilityThreshold: 0.5,
  minShoulderSpan: 0.01,
  warmupMs: 5000,
  emaAlphaMin: 0.05,
  emaAlphaMax: 0.2,
  badDurationMs: 2_000,
  recoverDurationMs: 500,
  scoreThresholdBad: 1.6,
  scoreThresholdGood: 1.2,
  scoreZClamp: 3.5,
  minUsableFeatureCount: 3,
  lowConfidenceThreshold: 0.5,
  lowConfidenceBadThresholdBoost: 0.15,
  shoulderDropEnterMs: 400,
  shoulderDropExitMs: 500,
  sourceReliability: {
    world: 1,
    image: 0.85,
  },
  torsoVerticalFallbackReliability: 0.75,
  turnThresholds: {
    shoulderZDiffRatio: 0.25, // 肩幅に対する肩のZ軸(奥行き)の差の比率
    shoulderXAsymmetry: 0.35, // 鼻と肩の左右非対称比率
    headYawRatio: 0.55, // 鼻と耳の非対称比率 (首の回転)
    headYawRatioSevere: 0.35, // これ未満は「過度な首回転」とみなしてBad候補に含める
  },
  headWidthBoost: {
    triggerScale: 1.3,
    fullScale: 1.6,
    maxScoreBoost: 0.35,
    baselineFloor: 0.25,
  },
  headForwardMinSamples: 12,
  madFloor: {
    headLateralOffsetRatio: 0.02,
    earShoulderDistanceRatio: 0.02,
    torsoTiltDeg: 2,
    neckAngleDeg: 2,
    earShoulderAsymmetryRatio: 0.02,
    headForwardAngleDeg: 2,
  } as const,
  weights: {
    front: {
      headLateralOffsetRatio: 0.24,
      earShoulderDistanceRatio: 0.1,
      torsoTiltDeg: 0.12,
      neckAngleDeg: 0.1,
      earShoulderAsymmetryRatio: 0.18,
      headForwardAngleDeg: 0.26,
    },
    side: {
      headLateralOffsetRatio: 0.34,
      earShoulderDistanceRatio: 0.2,
      torsoTiltDeg: 0.15,
      neckAngleDeg: 0.1,
      earShoulderAsymmetryRatio: 0.0, // 側面では非対称性が無意味なため0に設定
      headForwardAngleDeg: 0.26, // 非対称性の重み(0.05)をストレートネックに移動
    },
  } as const,
};
