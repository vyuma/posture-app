import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";

export type ViewClass = "front" | "side" | "unknown";

export type PostureFeatures = {
  headLateralOffsetRatio: number;
  earShoulderDistanceRatio: number;
  torsoTiltDeg: number;
  neckAngleDeg: number;
  earShoulderAsymmetryRatio: number;
  headForwardAngleDeg: number;
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
  noseShoulderZDelta: number | null;
  headForwardAngleDeg: number | null;
  sourceQuality: PostureExperimentSourceQuality;
  proxy: PostureExperimentProxy | null;
};

type FeatureKey = keyof PostureFeatures;

type FeatureStats = {
  median: number;
  mad: number;
  scale: number;
};

type BaselineStats = Record<FeatureKey, FeatureStats>;

type Point3 = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

type ExtractedPoints = {
  N: Point3;
  EL: Point3;
  ER: Point3;
  SL: Point3;
  SR: Point3;
};

type LandmarkSelection = {
  N: PickedPoint | null;
  EL: PickedPoint | null;
  ER: PickedPoint | null;
  SL: PickedPoint | null;
  SR: PickedPoint | null;
  HL: PickedPoint | null;
  HR: PickedPoint | null;
};

type PickedPoint = {
  point: Point3;
  source: "world" | "image";
};

type ExtractFeatureResult = {
  qualityOk: boolean;
  features: PostureFeatures | null;
  points: ExtractedPoints | null;
  usingWorldLandmarks: boolean;
};

type ScoreResult = {
  scoreRaw: number;
  scoreEma: number;
  headWidthScale: number | null;
  headWidthScoreBoost: number;
};

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

const FEATURE_KEYS: FeatureKey[] = [
  "headLateralOffsetRatio",
  "earShoulderDistanceRatio",
  "torsoTiltDeg",
  "neckAngleDeg",
  "earShoulderAsymmetryRatio",
  "headForwardAngleDeg",
];
const DEG_PER_RAD = 180 / Math.PI;
const VERTICAL_AXIS = { x: 0, y: -1 };
const VERTICAL_AXIS_3D = { x: 0, y: -1, z: 0 };

const EMPTY_EXPERIMENT: PostureExperimentMetrics = {
  neckAngle2dFallback: null,
  neckAngle3d: null,
  noseShoulderZDelta: null,
  headForwardAngleDeg: null,
  sourceQuality: "insufficient",
  proxy: null,
};

const LANDMARK = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

export const POSTURE_SPEC = {
  visibilityThreshold: 0.5,
  minShoulderSpan: 0.01,
  warmupMs: 5000,
  emaAlpha: 0.2,
  badDurationMs: 2_000,
  recoverDurationMs: 500,
  scoreThresholdBad: 1.6,
  scoreThresholdGood: 1.2,
  shoulderDropEnterMs: 400,
  shoulderDropExitMs: 500,
  turnThresholds: {
    shoulderZDiffRatio: 0.25, // 肩幅に対する肩のZ軸(奥行き)の差の比率
    shoulderXAsymmetry: 0.35, // 鼻と肩の左右非対称比率
    headYawRatio: 0.55,        // 鼻と耳の非対称比率 (首の回転)
  },
  headWidthBoost: {
    triggerScale: 1.3,
    fullScale: 1.6,
    maxScoreBoost: 0.35,
    baselineFloor: 0.25,
  },
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
      earShoulderAsymmetryRatio: 0.00, // 側面では非対称性が無意味なため0に設定
      headForwardAngleDeg: 0.26, // 非対称性の重み(0.05)をストレートネックに移動
    },
    unknown: {
      headLateralOffsetRatio: 0.22,
      earShoulderDistanceRatio: 0.15,
      torsoTiltDeg: 0.15,
      neckAngleDeg: 0.12,
      earShoulderAsymmetryRatio: 0.12,
      headForwardAngleDeg: 0.24,
    },
  } as const,
};

export function createPostureEngineState(): PostureEngineState {
  return {
    warmupStartMs: null,
    warmupSamples: {
      headLateralOffsetRatio: [],
      earShoulderDistanceRatio: [],
      torsoTiltDeg: [],
      neckAngleDeg: [],
      earShoulderAsymmetryRatio: [],
      headForwardAngleDeg: [],
    },
    headWidthWarmupSamples: [],
    baseline: null,
    baselineHeadWidthRatio: null,
    emaScore: null,
    candidateBadState: false,
    shoulderEstablished: false,
    shoulderDropActive: false,
    shoulderMissingAccumMs: 0,
    shoulderRecoveryAccumMs: 0,
    shoulderDropLastTsMs: null,
    stableState: "good",
    postureState: "hold",
    badAccumMs: 0,
    goodAccumMs: 0,
    lastTsMs: null,
  };
}

export function extractFeatures(
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
): ExtractFeatureResult {
  const selected = pickLandmarkSet(landmarks, worldLandmarks);
  return extractFeaturesFromSelection(selected);
}

function extractFeaturesFromSelection(
  selected: LandmarkSelection,
): ExtractFeatureResult {
  const usingWorldLandmarks = Object.values(selected).some(
    (item) => item !== null && item.source === "world",
  );

  if (!hasRequiredCorePoints(selected)) {
    return {
      qualityOk: false,
      features: null,
      points: null,
      usingWorldLandmarks,
    };
  }

  const points = buildCorePoints(selected);
  const { N, EL, ER, SL, SR } = points;
  const SM = midpoint(SL, SR);
  const EM = midpoint(EL, ER);

  const shoulderSpan = distance2D(SL, SR);
  if (!isFiniteNumber(shoulderSpan) || shoulderSpan < POSTURE_SPEC.minShoulderSpan) {
    return {
      qualityOk: false,
      features: null,
      points,
      usingWorldLandmarks,
    };
  }

  const torsoAxis = buildTorsoAxis(selected, SM);
  if (!torsoAxis) {
    return {
      qualityOk: false,
      features: null,
      points,
      usingWorldLandmarks,
    };
  }

  const horizontalAxis = { x: -torsoAxis.y, y: torsoAxis.x };

  const headLateralOffsetRatio =
    dot2D(subtract2D(N, SM), horizontalAxis) / shoulderSpan;
  const earShoulderDistanceRatio = distance2D(EM, SM) / shoulderSpan;
  const torsoTiltDeg = angleDegBetween2D(torsoAxis, { x: 0, y: -1 });
  const neckAngle3d = computeNeckAngle3D(selected, N, EM, SM);
  const neckAngle2dFallback =
    neckAngle3d === null ? computeNeckAngle2D(N, EM, torsoAxis) : null;
  const neckAngleDeg = neckAngle3d ?? neckAngle2dFallback;
  const leftEarShoulder = distance2D(EL, SL);
  const rightEarShoulder = distance2D(ER, SR);
  const earShoulderAsymmetryRatio =
    Math.abs(leftEarShoulder - rightEarShoulder) / shoulderSpan;
  const headForwardAngleDeg = computeHeadForwardAngle3D(selected, EM, SM);

  if (neckAngleDeg === null) {
    return {
      qualityOk: false,
      features: null,
      points,
      usingWorldLandmarks,
    };
  }

  const featureValues = [
    headLateralOffsetRatio,
    earShoulderDistanceRatio,
    torsoTiltDeg,
    neckAngleDeg,
    earShoulderAsymmetryRatio,
    headForwardAngleDeg,
  ];

  if (!featureValues.every(isFiniteNumber)) {
    return {
      qualityOk: false,
      features: null,
      points,
      usingWorldLandmarks,
    };
  }

  return {
    qualityOk: true,
    features: {
      headLateralOffsetRatio,
      earShoulderDistanceRatio,
      torsoTiltDeg,
      neckAngleDeg,
      earShoulderAsymmetryRatio,
      headForwardAngleDeg,
    },
    points,
    usingWorldLandmarks,
  };
}

export function getHeadYawRatio(points: ExtractedPoints): number {
  const distL = Math.abs(points.N.x - points.EL.x);
  const distR = Math.abs(points.N.x - points.ER.x);
  const min = Math.min(distL, distR);
  const max = Math.max(distL, distR);
  
  if (max < 1e-6) return 0;
  return min / max;
}

export function checkHeadTurn(points: ExtractedPoints): boolean {
  return getHeadYawRatio(points) < POSTURE_SPEC.turnThresholds.headYawRatio;
}

export function checkBodyTurn(points: ExtractedPoints, usingWorldLandmarks: boolean): boolean {
  const shoulderSpan = distance2D(points.SL, points.SR);
  if (shoulderSpan < POSTURE_SPEC.minShoulderSpan) return true;

  if (usingWorldLandmarks) {
    const zDiff = Math.abs(points.SL.z - points.SR.z);
    return (zDiff / shoulderSpan) > POSTURE_SPEC.turnThresholds.shoulderZDiffRatio;
  } else {
    const distL = Math.abs(points.N.x - points.SL.x);
    const distR = Math.abs(points.N.x - points.SR.x);
    const min = Math.min(distL, distR);
    const max = Math.max(distL, distR);
    
    if (max < 1e-6) return true;
    return (min / max) < POSTURE_SPEC.turnThresholds.shoulderXAsymmetry;
  }
}

export function classifyView(points: ExtractedPoints, usingWorldLandmarks: boolean): ViewClass {
  if (checkBodyTurn(points, usingWorldLandmarks)) {
    return "side";
  }
  return "front";
}

export function computeScore(
  features: PostureFeatures,
  view: ViewClass,
  baseline: BaselineStats,
  previousEmaScore: number | null,
  headWidthRatio: number,
  baselineHeadWidthRatio: number | null,
  isHeadTurned: boolean
): ScoreResult {
  const weights: Record<FeatureKey, number> = { ...POSTURE_SPEC.weights[view] };

  if (view === "side" || isHeadTurned) {
    // 首を回した時や側面の場合、首の角度(neckAngleDeg)の重みをfront時の半分に縮小
    const halfFrontNeckWeight = POSTURE_SPEC.weights.front.neckAngleDeg / 2;
    const diff = weights.neckAngleDeg - halfFrontNeckWeight;
    
    weights.neckAngleDeg = halfFrontNeckWeight;
    weights.headForwardAngleDeg += diff; // 残りの重みはストレートネック角度に合算
  }

  const normalized = normalizeFeatures(features, baseline);
  const headWidthScale = computeHeadWidthScale(
    headWidthRatio,
    baselineHeadWidthRatio,
  );
  const headWidthScoreBoost = computeHeadWidthScoreBoost(view, headWidthScale);

  let scoreRaw = 0;
  for (const key of FEATURE_KEYS) {
    scoreRaw += weights[key] * normalized[key];
  }
  scoreRaw += headWidthScoreBoost;

  const alpha = POSTURE_SPEC.emaAlpha;
  const scoreEma =
    previousEmaScore === null
      ? scoreRaw
      : alpha * scoreRaw + (1 - alpha) * previousEmaScore;

  return {
    scoreRaw,
    scoreEma,
    headWidthScale,
    headWidthScoreBoost,
  };
}

export function updatePostureState(
  previous: PostureEngineState,
  qualityOk: boolean,
  candidateBad: boolean,
  nowMs: number,
): PostureEngineState {
  const deltaMs =
    previous.lastTsMs === null
      ? 0
      : Math.max(0, Math.min(1000, nowMs - previous.lastTsMs));

  if (!qualityOk) {
    return {
      ...previous,
      postureState: "hold",
      lastTsMs: nowMs,
    };
  }

  let badAccumMs = previous.badAccumMs;
  let goodAccumMs = previous.goodAccumMs;

  if (candidateBad) {
    badAccumMs += deltaMs;
    goodAccumMs = 0;
  } else {
    goodAccumMs += deltaMs;
    badAccumMs = 0;
  }

  let stableState = previous.stableState;

  if (
    stableState === "good" &&
    badAccumMs >= POSTURE_SPEC.badDurationMs
  ) {
    stableState = "bad";
    badAccumMs = 0;
    goodAccumMs = 0;
  } else if (
    stableState === "bad" &&
    goodAccumMs >= POSTURE_SPEC.recoverDurationMs
  ) {
    stableState = "good";
    badAccumMs = 0;
    goodAccumMs = 0;
  }

  return {
    ...previous,
    stableState,
    postureState: stableState,
    badAccumMs,
    goodAccumMs,
    lastTsMs: nowMs,
  };
}

export function evaluatePostureFrame(
  previous: PostureEngineState,
  nowMs: number,
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
): { state: PostureEngineState; result: PostureFrameResult } {
  const initializedStartMs = previous.warmupStartMs ?? nowMs;
  const selected = pickLandmarkSet(landmarks, worldLandmarks);
  const shouldersVisible = areBothShouldersUsable(selected);
  const extracted = extractFeaturesFromSelection(selected);
  const experiment = computePostureExperiment(selected, extracted);

  let next: PostureEngineState = {
    ...previous,
    warmupStartMs: initializedStartMs,
  };
  next = updateShoulderDropMonitor(next, shouldersVisible, nowMs);

  if (!extracted.qualityOk || !extracted.features || !extracted.points) {
    next = updatePostureState(next, false, false, nowMs);
    if (next.shoulderDropActive) {
      next = forceBadState(next, nowMs);
    }
    return {
      state: next,
      result: {
        eval: {
          score: next.emaScore ?? 0,
          candidateBad: next.shoulderDropActive || next.candidateBadState,
          qualityOk: false,
          view: "unknown",
          isHeadTurned: false,
          headYawRatio: null,
          headWidthRatio: null,
          headWidthScale: null,
          headWidthScoreBoost: 0,
        },
        features: null,
        postureState: next.postureState,
        warmupRemainingMs: remainingWarmupMs(initializedStartMs, nowMs),
        baselineReady: next.baseline !== null,
        usingWorldLandmarks: extracted.usingWorldLandmarks,
        experiment,
      },
    };
  }

  const view = classifyView(extracted.points, extracted.usingWorldLandmarks);
  const headYawRatio = getHeadYawRatio(extracted.points);
  const isHeadTurned = headYawRatio < POSTURE_SPEC.turnThresholds.headYawRatio;
  const headWidthRatio = getEarToShoulderRatio(extracted.points);

  if (!next.baseline) {
    next = pushWarmupSample(next, extracted.features, headWidthRatio);

    if (nowMs - initializedStartMs >= POSTURE_SPEC.warmupMs) {
      next = {
        ...next,
        baseline: buildBaseline(next.warmupSamples),
        baselineHeadWidthRatio: buildHeadWidthBaseline(
          next.headWidthWarmupSamples,
        ),
      };
    }
  }

  if (!next.baseline) {
    next = updatePostureState(next, false, false, nowMs);
    if (next.shoulderDropActive) {
      next = forceBadState(next, nowMs);
    }
    return {
      state: next,
      result: {
        eval: {
          score: next.emaScore ?? 0,
          candidateBad: next.shoulderDropActive || next.candidateBadState,
          qualityOk: false,
          view,
          isHeadTurned,
          headYawRatio,
          headWidthRatio: headWidthRatio,
          headWidthScale: null,
          headWidthScoreBoost: 0,
        },
        features: extracted.features,
        postureState: next.postureState,
        warmupRemainingMs: remainingWarmupMs(initializedStartMs, nowMs),
        baselineReady: false,
        usingWorldLandmarks: extracted.usingWorldLandmarks,
        experiment,
      },
    };
  }

  const scoreResult = computeScore(
    extracted.features,
    view,
    next.baseline,
    next.emaScore,
    headWidthRatio,
    next.baselineHeadWidthRatio,
    isHeadTurned
  );
  const nextCandidateBad = resolveCandidateBadState(
    next.candidateBadState,
    scoreResult.scoreEma,
  );
  const mergedCandidateBad = next.shoulderDropActive || nextCandidateBad;

  next = {
    ...next,
    emaScore: scoreResult.scoreEma,
    candidateBadState: nextCandidateBad,
  };

  next = updatePostureState(next, true, mergedCandidateBad, nowMs);
  if (next.shoulderDropActive) {
    next = forceBadState(next, nowMs);
  }

  return {
    state: next,
    result: {
      eval: {
        score: scoreResult.scoreEma,
        candidateBad: mergedCandidateBad,
        qualityOk: true,
        view,
        isHeadTurned,
        headYawRatio,
        headWidthRatio,
        headWidthScale: scoreResult.headWidthScale,
        headWidthScoreBoost: scoreResult.headWidthScoreBoost,
      },
      features: extracted.features,
      postureState: next.postureState,
      warmupRemainingMs: 0,
      baselineReady: true,
      usingWorldLandmarks: extracted.usingWorldLandmarks,
      experiment,
    },
  };
}

function remainingWarmupMs(startMs: number, nowMs: number) {
  return Math.max(0, POSTURE_SPEC.warmupMs - Math.max(0, nowMs - startMs));
}

function pushWarmupSample(
  state: PostureEngineState,
  features: PostureFeatures,
  headWidthRatio: number,
): PostureEngineState {
  const nextSamples: PostureEngineState["warmupSamples"] = {
    headLateralOffsetRatio: [
      ...state.warmupSamples.headLateralOffsetRatio,
      features.headLateralOffsetRatio,
    ],
    earShoulderDistanceRatio: [
      ...state.warmupSamples.earShoulderDistanceRatio,
      features.earShoulderDistanceRatio,
    ],
    torsoTiltDeg: [
      ...state.warmupSamples.torsoTiltDeg,
      features.torsoTiltDeg,
    ],
    neckAngleDeg: [
      ...state.warmupSamples.neckAngleDeg,
      features.neckAngleDeg,
    ],
    earShoulderAsymmetryRatio: [
      ...state.warmupSamples.earShoulderAsymmetryRatio,
      features.earShoulderAsymmetryRatio,
    ],
    headForwardAngleDeg: [
      ...state.warmupSamples.headForwardAngleDeg,
      features.headForwardAngleDeg,
    ],
  };
  const nextHeadWidthSamples = isFiniteNumber(headWidthRatio) && headWidthRatio > 0
    ? [...state.headWidthWarmupSamples, headWidthRatio]
    : state.headWidthWarmupSamples;

  return {
    ...state,
    warmupSamples: nextSamples,
    headWidthWarmupSamples: nextHeadWidthSamples,
  };
}

function buildHeadWidthBaseline(samples: number[]) {
  const usable = samples.filter((value) => isFiniteNumber(value) && value > 0);
  if (usable.length === 0) {
    return null;
  }

  return median(usable);
}

function buildBaseline(
  samples: Record<FeatureKey, number[]>,
): BaselineStats {
  const baseline = {} as BaselineStats;

  for (const key of FEATURE_KEYS) {
    const list = samples[key];
    const center = list.length > 0 ? median(list) : 0;
    const absDiffs = list.map((value) => Math.abs(value - center));
    const mad = absDiffs.length > 0 ? median(absDiffs) : 0;
    baseline[key] = {
      median: center,
      mad,
      scale: Math.max(mad, POSTURE_SPEC.madFloor[key]),
    };
  }

  return baseline;
}

function normalizeFeatures(
  features: PostureFeatures,
  baseline: BaselineStats,
): PostureFeatures {
  return {
    headLateralOffsetRatio:
      Math.abs(
        features.headLateralOffsetRatio -
          baseline.headLateralOffsetRatio.median,
      ) / baseline.headLateralOffsetRatio.scale,
    earShoulderDistanceRatio:
      Math.abs(
        features.earShoulderDistanceRatio -
          baseline.earShoulderDistanceRatio.median,
      ) / baseline.earShoulderDistanceRatio.scale,
    torsoTiltDeg:
      Math.abs(features.torsoTiltDeg - baseline.torsoTiltDeg.median) /
      baseline.torsoTiltDeg.scale,
    neckAngleDeg:
      Math.abs(features.neckAngleDeg - baseline.neckAngleDeg.median) /
      baseline.neckAngleDeg.scale,
    earShoulderAsymmetryRatio:
      Math.abs(
        features.earShoulderAsymmetryRatio -
          baseline.earShoulderAsymmetryRatio.median,
      ) / baseline.earShoulderAsymmetryRatio.scale,
    headForwardAngleDeg:
      Math.max(0,
        features.headForwardAngleDeg - baseline.headForwardAngleDeg.median,
      ) / baseline.headForwardAngleDeg.scale,
  };
}

function getEarToShoulderRatio(points: ExtractedPoints) {
  const shoulderSpan = distance2D(points.SL, points.SR);
  const earSpan = distance2D(points.EL, points.ER);
  const shoulderSafe = Math.max(shoulderSpan, POSTURE_SPEC.minShoulderSpan);
  return earSpan / shoulderSafe;
}

function computeHeadWidthScale(
  headWidthRatio: number,
  baselineHeadWidthRatio: number | null,
) {
  if (
    baselineHeadWidthRatio === null ||
    baselineHeadWidthRatio < POSTURE_SPEC.headWidthBoost.baselineFloor ||
    !isFiniteNumber(headWidthRatio)
  ) {
    return null;
  }

  const scale = headWidthRatio / baselineHeadWidthRatio;
  return isFiniteNumber(scale) ? scale : null;
}

function computeHeadWidthScoreBoost(
  view: ViewClass,
  headWidthScale: number | null,
) {
  if (view === "side") {
    return 0;
  }

  if (headWidthScale === null) {
    return 0;
  }

  const { triggerScale, fullScale, maxScoreBoost } = POSTURE_SPEC.headWidthBoost;
  if (headWidthScale <= triggerScale) {
    return 0;
  }

  const progress = clamp(
    (headWidthScale - triggerScale) / Math.max(1e-6, fullScale - triggerScale),
    0,
    1,
  );
  return maxScoreBoost * progress;
}

function areBothShouldersUsable(selected: LandmarkSelection) {
  return isUsablePoint(selected.SL) && isUsablePoint(selected.SR);
}

function updateShoulderDropMonitor(
  previous: PostureEngineState,
  shouldersVisible: boolean,
  nowMs: number,
): PostureEngineState {
  const deltaMs =
    previous.shoulderDropLastTsMs === null
      ? 0
      : Math.max(0, Math.min(1000, nowMs - previous.shoulderDropLastTsMs));

  let shoulderEstablished = previous.shoulderEstablished || shouldersVisible;
  let shoulderDropActive = previous.shoulderDropActive;
  let shoulderMissingAccumMs = previous.shoulderMissingAccumMs;
  let shoulderRecoveryAccumMs = previous.shoulderRecoveryAccumMs;

  if (!shoulderEstablished) {
    return {
      ...previous,
      shoulderDropLastTsMs: nowMs,
    };
  }

  if (shouldersVisible) {
    shoulderMissingAccumMs = 0;
    if (shoulderDropActive) {
      shoulderRecoveryAccumMs += deltaMs;
      if (shoulderRecoveryAccumMs >= POSTURE_SPEC.shoulderDropExitMs) {
        shoulderDropActive = false;
        shoulderRecoveryAccumMs = 0;
      }
    } else {
      shoulderRecoveryAccumMs = 0;
    }
  } else {
    shoulderRecoveryAccumMs = 0;
    if (!shoulderDropActive) {
      shoulderMissingAccumMs += deltaMs;
      if (shoulderMissingAccumMs >= POSTURE_SPEC.shoulderDropEnterMs) {
        shoulderDropActive = true;
        shoulderMissingAccumMs = 0;
      }
    }
  }

  return {
    ...previous,
    shoulderEstablished,
    shoulderDropActive,
    shoulderMissingAccumMs,
    shoulderRecoveryAccumMs,
    shoulderDropLastTsMs: nowMs,
  };
}

function forceBadState(state: PostureEngineState, nowMs: number): PostureEngineState {
  return {
    ...state,
    stableState: "bad",
    postureState: "bad",
    badAccumMs: 0,
    goodAccumMs: 0,
    lastTsMs: nowMs,
  };
}

function pickLandmarkSet(
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
): LandmarkSelection {
  return {
    N: pickPoint(LANDMARK.NOSE, landmarks, worldLandmarks),
    EL: pickPoint(LANDMARK.LEFT_EAR, landmarks, worldLandmarks),
    ER: pickPoint(LANDMARK.RIGHT_EAR, landmarks, worldLandmarks),
    SL: pickPoint(LANDMARK.LEFT_SHOULDER, landmarks, worldLandmarks),
    SR: pickPoint(LANDMARK.RIGHT_SHOULDER, landmarks, worldLandmarks),
    HL: pickPoint(LANDMARK.LEFT_HIP, landmarks, worldLandmarks),
    HR: pickPoint(LANDMARK.RIGHT_HIP, landmarks, worldLandmarks),
  };
}

function hasRequiredCorePoints(selected: LandmarkSelection) {
  return (
    isUsablePoint(selected.N) &&
    isUsablePoint(selected.EL) &&
    isUsablePoint(selected.ER) &&
    isUsablePoint(selected.SL) &&
    isUsablePoint(selected.SR)
  );
}

function buildCorePoints(selected: LandmarkSelection): ExtractedPoints {
  return {
    N: selected.N!.point,
    EL: selected.EL!.point,
    ER: selected.ER!.point,
    SL: selected.SL!.point,
    SR: selected.SR!.point,
  };
}

function buildTorsoAxis(
  selected: LandmarkSelection,
  shoulderMidpoint: Point3,
) {
  const hipsUsable = isUsablePoint(selected.HL) && isUsablePoint(selected.HR);
  if (!hipsUsable) {
    return VERTICAL_AXIS;
  }

  const hipMidpoint = midpoint(selected.HL!.point, selected.HR!.point);
  return normalize2D(subtract2D(shoulderMidpoint, hipMidpoint)) ?? VERTICAL_AXIS;
}

function computeNeckAngle2D(
  nose: Point3,
  earMidpoint: Point3,
  torsoAxis: { x: number; y: number },
) {
  return angleDegBetween2D(subtract2D(nose, earMidpoint), torsoAxis);
}

function computeNeckAngle3D(
  selected: LandmarkSelection,
  nose: Point3,
  earMidpoint: Point3,
  shoulderMidpoint: Point3,
) {
  if (!areCorePointsFromWorld(selected)) {
    return null;
  }

  const hipMidpoint =
    isWorldUsablePoint(selected.HL) && isWorldUsablePoint(selected.HR)
      ? midpoint(selected.HL!.point, selected.HR!.point)
      : null;
  const torsoAxis3D = hipMidpoint
    ? subtract3D(shoulderMidpoint, hipMidpoint)
    : VERTICAL_AXIS_3D;

  return angleDegBetweenProjectedYZ(
    subtract3D(nose, earMidpoint),
    torsoAxis3D,
  );
}

function computeHeadForwardAngle3D(
  selected: LandmarkSelection,
  earMidpoint: Point3,
  shoulderMidpoint: Point3,
) {
  if (!areCorePointsFromWorld(selected)) {
    return 0;
  }

  return (
    angleDegBetweenProjectedYZ(
      subtract3D(earMidpoint, shoulderMidpoint),
      VERTICAL_AXIS_3D,
    ) ?? 0
  );
}

function computePostureExperiment(
  selected: LandmarkSelection,
  extracted: ExtractFeatureResult,
): PostureExperimentMetrics {
  const sourceQuality = getExperimentSourceQuality(
    selected,
    extracted.qualityOk,
  );

  if (!extracted.qualityOk || !extracted.features || !extracted.points) {
    return {
      ...EMPTY_EXPERIMENT,
      sourceQuality,
    };
  }

  const { N, EL, ER, SL, SR } = extracted.points;
  const SM = midpoint(SL, SR);
  const EM = midpoint(EL, ER);

  if (!areCorePointsFromWorld(selected)) {
    return {
      ...EMPTY_EXPERIMENT,
      neckAngle2dFallback: extracted.features.neckAngleDeg,
      sourceQuality,
    };
  }

  const hipsFromWorld =
    isWorldUsablePoint(selected.HL) && isWorldUsablePoint(selected.HR);
  const HM = hipsFromWorld
    ? midpoint(selected.HL!.point, selected.HR!.point)
    : null;
  const neckAngle3d = computeNeckAngle3D(selected, N, EM, SM);
  const neckAngle2dFallback =
    neckAngle3d === null ? extracted.features.neckAngleDeg : null;

  return {
    neckAngle2dFallback,
    neckAngle3d,
    noseShoulderZDelta: finiteOrNull(N.z - SM.z),
    headForwardAngleDeg: extracted.features.headForwardAngleDeg,
    sourceQuality: hipsFromWorld ? sourceQuality : "vertical-fallback",
    proxy: {
      nose: toExperimentProxyPoint(N),
      earMidpoint: toExperimentProxyPoint(EM),
      shoulderMidpoint: toExperimentProxyPoint(SM),
      hipMidpoint: HM ? toExperimentProxyPoint(HM) : null,
    },
  };
}

function getExperimentSourceQuality(
  selected: LandmarkSelection,
  coreQualityOk: boolean,
): PostureExperimentSourceQuality {
  if (!coreQualityOk || !hasRequiredCorePoints(selected)) {
    return "insufficient";
  }

  if (!isUsablePoint(selected.HL) || !isUsablePoint(selected.HR)) {
    return "missing-hips";
  }

  const sources = [
    selected.N,
    selected.EL,
    selected.ER,
    selected.SL,
    selected.SR,
    selected.HL,
    selected.HR,
  ].map((item) => item!.source);

  const uniqueSources = new Set(sources);
  if (uniqueSources.size > 1) {
    return "mixed";
  }

  return sources[0];
}

function areCorePointsFromWorld(selected: LandmarkSelection) {
  return (
    isWorldUsablePoint(selected.N) &&
    isWorldUsablePoint(selected.EL) &&
    isWorldUsablePoint(selected.ER) &&
    isWorldUsablePoint(selected.SL) &&
    isWorldUsablePoint(selected.SR)
  );
}

function isWorldUsablePoint(item: PickedPoint | null) {
  return isUsablePoint(item) && item!.source === "world";
}

function toExperimentProxyPoint(point: Point3): PostureExperimentProxyPoint {
  return {
    y: point.y,
    z: point.z,
    visibility: point.visibility,
  };
}

function isUsablePoint(item: PickedPoint | null) {
  return item !== null && item.point.visibility >= POSTURE_SPEC.visibilityThreshold;
}

function pickPoint(
  index: number,
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
): PickedPoint | null {
  const worldPoint = worldLandmarks?.[index];
  if (worldPoint && isFinitePoint(worldPoint)) {
    return {
      point: {
        x: worldPoint.x,
        y: worldPoint.y,
        z: worldPoint.z,
        visibility: worldPoint.visibility,
      },
      source: "world",
    };
  }

  const imagePoint = landmarks?.[index];
  if (imagePoint && isFinitePoint(imagePoint)) {
    return {
      point: {
        x: imagePoint.x,
        y: imagePoint.y,
        z: imagePoint.z,
        visibility: imagePoint.visibility,
      },
      source: "image",
    };
  }

  return null;
}

function midpoint(a: Point3, b: Point3): Point3 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

function subtract2D(a: Pick<Point3, "x" | "y">, b: Pick<Point3, "x" | "y">) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function subtract3D(a: Point3, b: Point3) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function dot2D(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

function distance2D(
  a: Pick<Point3, "x" | "y">,
  b: Pick<Point3, "x" | "y">,
) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize2D(vector: { x: number; y: number }) {
  const length = Math.hypot(vector.x, vector.y);
  if (!isFiniteNumber(length) || length < 1e-6) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function angleDegBetween2D(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const na = normalize2D(a);
  const nb = normalize2D(b);

  if (!na || !nb) {
    return NaN;
  }

  const cosine = clamp(dot2D(na, nb), -1, 1);
  return Math.acos(cosine) * DEG_PER_RAD;
}

function angleDegBetweenProjectedYZ(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) {
  const lengthA = Math.hypot(a.y, a.z);
  const lengthB = Math.hypot(b.y, b.z);
  if (
    !isFiniteNumber(lengthA) ||
    !isFiniteNumber(lengthB) ||
    lengthA < 1e-6 ||
    lengthB < 1e-6
  ) {
    return null;
  }

  const delta = Math.atan2(a.z, a.y) - Math.atan2(b.z, b.y);
  return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) * DEG_PER_RAD;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function finiteOrNull(value: number) {
  return isFiniteNumber(value) ? value : null;
}

function isFinitePoint(point: { x: number; y: number; z: number; visibility: number }) {
  return (
    isFiniteNumber(point.x) &&
    isFiniteNumber(point.y) &&
    isFiniteNumber(point.z) &&
    isFiniteNumber(point.visibility)
  );
}

function resolveCandidateBadState(previous: boolean, scoreEma: number) {
  if (previous) {
    return scoreEma >= POSTURE_SPEC.scoreThresholdGood;
  }

  return scoreEma >= POSTURE_SPEC.scoreThresholdBad;
}
