import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";

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
  noseShoulderZDelta: number | null;
  headForwardAngleDeg: number | null;
  sourceQuality: PostureExperimentSourceQuality;
  proxy: PostureExperimentProxy | null;
};

type FeatureKey = keyof PostureFeatures;
type BodyTurnSource = "world" | "image";
type FeatureReliabilityMap = Record<FeatureKey, number>;

type FeatureStats = {
  median: number;
  mad: number;
  scale: number;
  sampleCount: number;
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
  points2d: ExtractedPoints | null;
  points3d: ExtractedPoints | null;
  usingWorldLandmarks: boolean;
};

type ScoreResult = {
  scoreEma: number;
  headWidthScale: number | null;
  headWidthScoreBoost: number;
  confidence: number;
  usableFeatureCount: number;
};

type NormalizedFeatureMap = Record<FeatureKey, number | null>;

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
    headYawRatio: 0.55,        // 鼻と耳の非対称比率 (首の回転)
    headYawRatioSevere: 0.35,  // これ未満は「過度な首回転」とみなしてBad候補に含める
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
      earShoulderAsymmetryRatio: 0.00, // 側面では非対称性が無意味なため0に設定
      headForwardAngleDeg: 0.26, // 非対称性の重み(0.05)をストレートネックに移動
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

function extractFeaturesFromSelection(
  selected2d: LandmarkSelection,
  selected3d: LandmarkSelection,
): ExtractFeatureResult {
  const points2d = buildCorePoints(selected2d);
  const points3d = buildCorePoints(selected3d);
  const usingWorldLandmarks = points3d !== null;

  if (!points2d) {
    return {
      qualityOk: false,
      features: null,
      points2d: null,
      points3d,
      usingWorldLandmarks,
    };
  }

  const { N, EL, ER, SL, SR } = points2d;
  const SM = midpoint(SL, SR);
  const EM = midpoint(EL, ER);

  const shoulderSpan = distance2D(SL, SR);
  if (!isFiniteNumber(shoulderSpan) || shoulderSpan < POSTURE_SPEC.minShoulderSpan) {
    return {
      qualityOk: false,
      features: null,
      points2d,
      points3d,
      usingWorldLandmarks,
    };
  }

  const torsoAxis = buildTorsoAxis(selected2d, SM, "image");
  const horizontalAxis = { x: -torsoAxis.y, y: torsoAxis.x };

  const headLateralOffsetRatio =
    dot2D(subtract2D(N, SM), horizontalAxis) / shoulderSpan;
  const earShoulderDistanceRatio = distance2D(EM, SM) / shoulderSpan;
  const torsoTiltDeg = angleDegBetween2D(torsoAxis, { x: 0, y: -1 });
  const neckAngle3d = points3d
    ? computeNeckAngle3D(
        selected3d,
        points3d.N,
        midpoint(points3d.EL, points3d.ER),
        midpoint(points3d.SL, points3d.SR),
      )
    : null;
  const neckAngle2dFallback =
    neckAngle3d === null ? computeNeckAngle2D(N, EM, torsoAxis) : null;
  const neckAngleDeg = neckAngle3d ?? neckAngle2dFallback;
  const leftEarShoulder = distance2D(EL, SL);
  const rightEarShoulder = distance2D(ER, SR);
  const earShoulderAsymmetryRatio =
    Math.abs(leftEarShoulder - rightEarShoulder) / shoulderSpan;
  const headForwardAngleDeg = points3d
    ? computeHeadForwardAngle3D(
        selected3d,
        midpoint(points3d.EL, points3d.ER),
        midpoint(points3d.SL, points3d.SR),
      )
    : null;

  if (neckAngleDeg === null) {
    return {
      qualityOk: false,
      features: null,
      points2d,
      points3d,
      usingWorldLandmarks,
    };
  }

  const requiredFeatureValues = [
    headLateralOffsetRatio,
    earShoulderDistanceRatio,
    torsoTiltDeg,
    neckAngleDeg,
    earShoulderAsymmetryRatio,
  ];

  if (!requiredFeatureValues.every(isFiniteNumber)) {
    return {
      qualityOk: false,
      features: null,
      points2d,
      points3d,
      usingWorldLandmarks,
    };
  }

  if (headForwardAngleDeg !== null && !isFiniteNumber(headForwardAngleDeg)) {
    return {
      qualityOk: false,
      features: null,
      points2d,
      points3d,
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
    points2d,
    points3d,
    usingWorldLandmarks,
  };
}

function getHeadYawRatio(points: ExtractedPoints): number | null {
  const distL = Math.abs(points.N.x - points.EL.x);
  const distR = Math.abs(points.N.x - points.ER.x);
  const min = Math.min(distL, distR);
  const max = Math.max(distL, distR);

  if (max < 1e-6) return null;
  return min / max;
}

function checkBodyTurn(
  points: ExtractedPoints,
  source: BodyTurnSource,
): boolean {
  const shoulderSpan = distance2D(points.SL, points.SR);
  if (shoulderSpan < POSTURE_SPEC.minShoulderSpan) return true;

  if (source === "world") {
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

function classifyView(
  points: ExtractedPoints,
  source: BodyTurnSource,
): ViewClass {
  if (checkBodyTurn(points, source)) {
    return "side";
  }
  return "front";
}

function computeScore(
  features: PostureFeatures,
  view: ViewClass,
  baseline: BaselineStats,
  previousEmaScore: number | null,
  headWidthRatio: number,
  baselineHeadWidthRatio: number | null,
  isHeadTurned: boolean,
  featureReliability: FeatureReliabilityMap,
): ScoreResult {
  const weightProfile = view === "side" ? "side" : "front";
  const weights: Record<FeatureKey, number> = { ...POSTURE_SPEC.weights[weightProfile] };

  if (view === "side" || isHeadTurned) {
    const halfFrontNeckWeight = POSTURE_SPEC.weights.front.neckAngleDeg * 0.6;
    const diff = weights.neckAngleDeg - halfFrontNeckWeight;
    
    weights.neckAngleDeg = halfFrontNeckWeight;
    weights.headForwardAngleDeg += diff; // 残りの重みはストレートネック角度に合算
    weights.headLateralOffsetRatio *= 0.8;
  }

  const normalized = normalizeFeatures(features, baseline);
  const headWidthScale = computeHeadWidthScale(
    headWidthRatio,
    baselineHeadWidthRatio,
  );
  const headWidthScoreBoost = computeHeadWidthScoreBoost(view, headWidthScale);

  let weightedScore = 0;
  let totalWeight = 0;
  let confidenceWeight = 0;
  let usableFeatureCount = 0;
  const totalBaseWeight = FEATURE_KEYS.reduce((sum, key) => sum + weights[key], 0);

  for (const key of FEATURE_KEYS) {
    const reliability = clamp(featureReliability[key] ?? 0, 0, 1);
    const effectiveWeight = weights[key] * reliability;
    confidenceWeight += effectiveWeight;

    const normalizedValue = normalized[key];
    if (normalizedValue === null || effectiveWeight <= 1e-6) {
      continue;
    }

    const clampedZ = clamp(normalizedValue, 0, POSTURE_SPEC.scoreZClamp);
    weightedScore += effectiveWeight * clampedZ;
    totalWeight += effectiveWeight;
    usableFeatureCount += 1;
  }

  const confidence =
    totalBaseWeight > 1e-6 ? clamp(confidenceWeight / totalBaseWeight, 0, 1) : 0;
  const scoreBase = totalWeight > 1e-6 ? weightedScore / totalWeight : 0;
  let scoreRaw = scoreBase;
  scoreRaw += headWidthScoreBoost;

  const alpha = lerp(
    POSTURE_SPEC.emaAlphaMin,
    POSTURE_SPEC.emaAlphaMax,
    confidence,
  );
  const scoreEma =
    previousEmaScore === null
      ? scoreRaw
      : alpha * scoreRaw + (1 - alpha) * previousEmaScore;

  return {
    scoreEma,
    headWidthScale,
    headWidthScoreBoost,
    confidence,
    usableFeatureCount,
  };
}

function updatePostureState(
  previous: PostureEngineState,
  qualityOk: boolean,
  candidateBad: boolean,
  nowMs: number,
  allowTransition = true,
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

  if (!allowTransition) {
    return {
      ...previous,
      postureState: previous.stableState,
      badAccumMs: 0,
      goodAccumMs: 0,
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
  const selected2d = pickLandmarkSetFromSource(
    landmarks,
    worldLandmarks,
    "image",
  );
  const selected3d = pickLandmarkSetFromSource(
    landmarks,
    worldLandmarks,
    "world",
  );
  const shouldersVisible = areBothShouldersUsable(selected);
  const extracted = extractFeaturesFromSelection(selected2d, selected3d);
  const experiment = computePostureExperiment(selected, extracted);

  let next: PostureEngineState = {
    ...previous,
    warmupStartMs: initializedStartMs,
  };
  next = updateShoulderDropMonitor(next, shouldersVisible, nowMs);

  if (!extracted.qualityOk || !extracted.features || !extracted.points2d) {
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

  const viewPoints = extracted.points3d ?? extracted.points2d;
  const viewSource: BodyTurnSource = extracted.points3d ? "world" : "image";
  const view = classifyView(viewPoints, viewSource);
  const headYawRatio = getHeadYawRatio(extracted.points2d);
  const isHeadTurned =
    headYawRatio !== null &&
    headYawRatio < POSTURE_SPEC.turnThresholds.headYawRatio;
  const isHeadTurnedSevere =
    headYawRatio !== null &&
    headYawRatio < POSTURE_SPEC.turnThresholds.headYawRatioSevere;
  const headWidthRatio = getEarToShoulderRatio(extracted.points2d);

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
    isHeadTurned,
    computeFeatureReliability(selected2d, selected3d, extracted.features),
  );
  const nextCandidateBad = resolveCandidateBadState(
    next.candidateBadState,
    scoreResult.scoreEma,
    scoreResult.confidence,
  );
  const mergedCandidateBad =
    next.shoulderDropActive || isHeadTurnedSevere || nextCandidateBad;
  const transitionEligible =
    isHeadTurnedSevere ||
    scoreResult.usableFeatureCount >= POSTURE_SPEC.minUsableFeatureCount;

  next = {
    ...next,
    emaScore: scoreResult.scoreEma,
    candidateBadState: nextCandidateBad,
  };

  next = updatePostureState(
    next,
    true,
    mergedCandidateBad,
    nowMs,
    transitionEligible,
  );
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
      ...(features.headForwardAngleDeg === null
        ? []
        : [features.headForwardAngleDeg]),
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
      sampleCount: list.length,
    };
  }

  return baseline;
}

function normalizeFeatures(
  features: PostureFeatures,
  baseline: BaselineStats,
): NormalizedFeatureMap {
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
    headForwardAngleDeg: normalizeHeadForwardAngle(
      features.headForwardAngleDeg,
      baseline.headForwardAngleDeg,
    ),
  };
}

function normalizeHeadForwardAngle(
  value: number | null,
  stats: FeatureStats,
) {
  if (
    value === null ||
    stats.sampleCount < POSTURE_SPEC.headForwardMinSamples
  ) {
    return null;
  }

  return Math.max(0, value - stats.median) / stats.scale;
}

function computeFeatureReliability(
  selected2d: LandmarkSelection,
  selected3d: LandmarkSelection,
  features: PostureFeatures,
): FeatureReliabilityMap {
  const imageReliability = POSTURE_SPEC.sourceReliability.image;
  const worldReliability = POSTURE_SPEC.sourceReliability.world;

  const shoulders2dVisibility = minUsableVisibility(
    [selected2d.SL, selected2d.SR],
    "image",
  );
  const hips2dVisibility = minUsableVisibility(
    [selected2d.HL, selected2d.HR],
    "image",
  );
  const core2dVisibility = minUsableVisibility(
    [selected2d.N, selected2d.EL, selected2d.ER, selected2d.SL, selected2d.SR],
    "image",
  );
  const earShoulder2dVisibility = minUsableVisibility(
    [selected2d.EL, selected2d.ER, selected2d.SL, selected2d.SR],
    "image",
  );
  const noseShoulder2dVisibility = minUsableVisibility(
    [selected2d.N, selected2d.SL, selected2d.SR],
    "image",
  );

  const torsoFallbackFactor =
    hips2dVisibility > 0 ? 1 : POSTURE_SPEC.torsoVerticalFallbackReliability;
  const torsoAxis2dVisibility =
    hips2dVisibility > 0
      ? Math.min(shoulders2dVisibility, hips2dVisibility)
      : shoulders2dVisibility;

  const hasWorldCore = areCorePointsFromWorld(selected3d);
  const worldCoreVisibility = minUsableVisibility(
    [selected3d.N, selected3d.EL, selected3d.ER, selected3d.SL, selected3d.SR],
    "world",
  );
  const worldEarShoulderVisibility = minUsableVisibility(
    [selected3d.EL, selected3d.ER, selected3d.SL, selected3d.SR],
    "world",
  );

  const neckAngleReliability = hasWorldCore
    ? worldReliability * worldCoreVisibility
    : imageReliability * core2dVisibility * torsoFallbackFactor;
  const headForwardReliability =
    features.headForwardAngleDeg === null
      ? 0
      : worldReliability * worldEarShoulderVisibility;

  return {
    headLateralOffsetRatio:
      imageReliability * noseShoulder2dVisibility * torsoFallbackFactor,
    earShoulderDistanceRatio: imageReliability * earShoulder2dVisibility,
    torsoTiltDeg:
      imageReliability * torsoAxis2dVisibility * torsoFallbackFactor,
    neckAngleDeg: neckAngleReliability,
    earShoulderAsymmetryRatio: imageReliability * earShoulder2dVisibility,
    headForwardAngleDeg: headForwardReliability,
  };
}

function minUsableVisibility(
  points: (PickedPoint | null)[],
  source?: BodyTurnSource,
) {
  let minVisibility = 1;

  for (const point of points) {
    if (!isUsablePoint(point)) {
      return 0;
    }

    if (source && point.source !== source) {
      return 0;
    }

    minVisibility = Math.min(minVisibility, clamp(point.point.visibility, 0, 1));
  }

  return minVisibility;
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

function pickLandmarkSetFromSource(
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
  source: BodyTurnSource,
): LandmarkSelection {
  return {
    N: pickPoint(LANDMARK.NOSE, landmarks, worldLandmarks, source),
    EL: pickPoint(LANDMARK.LEFT_EAR, landmarks, worldLandmarks, source),
    ER: pickPoint(LANDMARK.RIGHT_EAR, landmarks, worldLandmarks, source),
    SL: pickPoint(LANDMARK.LEFT_SHOULDER, landmarks, worldLandmarks, source),
    SR: pickPoint(LANDMARK.RIGHT_SHOULDER, landmarks, worldLandmarks, source),
    HL: pickPoint(LANDMARK.LEFT_HIP, landmarks, worldLandmarks, source),
    HR: pickPoint(LANDMARK.RIGHT_HIP, landmarks, worldLandmarks, source),
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

function buildCorePoints(selected: LandmarkSelection): ExtractedPoints | null {
  if (!hasRequiredCorePoints(selected)) {
    return null;
  }

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
  source: BodyTurnSource,
) {
  const hipsUsable =
    isSourceUsablePoint(selected.HL, source) &&
    isSourceUsablePoint(selected.HR, source);
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
    return null;
  }

  return angleDegBetweenProjectedYZ(
    subtract3D(earMidpoint, shoulderMidpoint),
    VERTICAL_AXIS_3D,
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

  if (!extracted.qualityOk || !extracted.features || !extracted.points2d) {
    return {
      ...EMPTY_EXPERIMENT,
      sourceQuality,
    };
  }

  if (!extracted.points3d || !areCorePointsFromWorld(selected)) {
    return {
      ...EMPTY_EXPERIMENT,
      neckAngle2dFallback: extracted.features.neckAngleDeg,
      sourceQuality,
    };
  }

  const { N, EL, ER, SL, SR } = extracted.points3d;
  const SM = midpoint(SL, SR);
  const EM = midpoint(EL, ER);

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

function isSourceUsablePoint(item: PickedPoint | null, source: BodyTurnSource) {
  return isUsablePoint(item) && item!.source === source;
}

function toExperimentProxyPoint(point: Point3): PostureExperimentProxyPoint {
  return {
    y: point.y,
    z: point.z,
    visibility: point.visibility,
  };
}

function isUsablePoint(item: PickedPoint | null): item is PickedPoint {
  return item !== null && item.point.visibility >= POSTURE_SPEC.visibilityThreshold;
}

function pickPoint(
  index: number,
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
  preferredSource?: BodyTurnSource,
): PickedPoint | null {
  const toPickedPoint = (
    source: BodyTurnSource,
    point: Landmark | NormalizedLandmark | null | undefined,
  ): PickedPoint | null => {
    if (!point || !isFinitePoint(point)) {
      return null;
    }

    return {
      point: {
        x: point.x,
        y: point.y,
        z: point.z,
        visibility: point.visibility,
      },
      source,
    };
  };

  const worldPicked = toPickedPoint("world", worldLandmarks?.[index]);
  const imagePicked = toPickedPoint("image", landmarks?.[index]);

  if (preferredSource === "world") {
    return worldPicked;
  }
  if (preferredSource === "image") {
    return imagePicked;
  }

  if (worldPicked) {
    return worldPicked;
  }
  if (imagePicked) {
    return imagePicked;
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

function lerp(min: number, max: number, t: number) {
  return min + (max - min) * clamp(t, 0, 1);
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

function resolveCandidateBadState(
  previous: boolean,
  scoreEma: number,
  confidence: number,
) {
  const badThreshold =
    confidence < POSTURE_SPEC.lowConfidenceThreshold
      ? POSTURE_SPEC.scoreThresholdBad +
        POSTURE_SPEC.lowConfidenceBadThresholdBoost
      : POSTURE_SPEC.scoreThresholdBad;

  if (previous) {
    return scoreEma >= POSTURE_SPEC.scoreThresholdGood;
  }

  return scoreEma >= badThreshold;
}
