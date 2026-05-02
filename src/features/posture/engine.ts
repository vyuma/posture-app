import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";

export type ViewClass = "front" | "side" | "unknown";

export type PostureFeatures = {
  f1: number;
  f2: number;
  f3: number;
  f4: number;
  f5: number;
};

export type PostureState = "good" | "bad" | "hold";

export type PostureEval = {
  score: number;
  candidateBad: boolean;
  qualityOk: boolean;
  view: ViewClass;
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
};

export type PostureFrameResult = {
  eval: PostureEval;
  features: PostureFeatures | null;
  postureState: PostureState;
  warmupRemainingMs: number;
  baselineReady: boolean;
  usingWorldLandmarks: boolean;
};

export type PostureEngineState = {
  warmupStartMs: number | null;
  warmupSamples: Record<FeatureKey, number[]>;
  baseline: BaselineStats | null;
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

const FEATURE_KEYS: FeatureKey[] = ["f1", "f2", "f3", "f4", "f5"];
const DEG_PER_RAD = 180 / Math.PI;
const VERTICAL_AXIS = { x: 0, y: -1 };

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
  viewThresholds: {
    frontEarToShoulderRatioMin: 0.55,
    sideEarToShoulderRatioMax: 0.35,
  },
  madFloor: {
    f1: 0.02,
    f2: 0.02,
    f3: 2,
    f4: 2,
    f5: 0.02,
  } as const,
  weights: {
    front: {
      f1: 0.35,
      f2: 0.1,
      f3: 0.15,
      f4: 0.1,
      f5: 0.3,
    },
    side: {
      f1: 0.4,
      f2: 0.25,
      f3: 0.2,
      f4: 0.15,
      f5: 0,
    },
    unknown: {
      f1: 0.24,
      f2: 0.18,
      f3: 0.2,
      f4: 0.18,
      f5: 0.2,
    },
  } as const,
};

export function createPostureEngineState(): PostureEngineState {
  return {
    warmupStartMs: null,
    warmupSamples: {
      f1: [],
      f2: [],
      f3: [],
      f4: [],
      f5: [],
    },
    baseline: null,
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

  const f1 = dot2D(subtract2D(N, SM), horizontalAxis) / shoulderSpan;
  const f2 = distance2D(EM, SM) / shoulderSpan;
  const f3 = angleDegBetween2D(torsoAxis, { x: 0, y: -1 });
  const neckVector = subtract2D(N, EM);
  const f4 = angleDegBetween2D(neckVector, torsoAxis);
  const leftEarShoulder = distance2D(EL, SL);
  const rightEarShoulder = distance2D(ER, SR);
  const f5 = Math.abs(leftEarShoulder - rightEarShoulder) / shoulderSpan;

  if (![f1, f2, f3, f4, f5].every(isFiniteNumber)) {
    return {
      qualityOk: false,
      features: null,
      points,
      usingWorldLandmarks,
    };
  }

  return {
    qualityOk: true,
    features: { f1, f2, f3, f4, f5 },
    points,
    usingWorldLandmarks,
  };
}

export function classifyView(points: ExtractedPoints): ViewClass {
  const shoulderSpan = distance2D(points.SL, points.SR);
  const earSpan = distance2D(points.EL, points.ER);
  const shoulderSafe = Math.max(shoulderSpan, POSTURE_SPEC.minShoulderSpan);
  const ratio = earSpan / shoulderSafe;

  if (!isFiniteNumber(ratio)) {
    return "unknown";
  }

  if (ratio >= POSTURE_SPEC.viewThresholds.frontEarToShoulderRatioMin) {
    return "front";
  }

  if (ratio <= POSTURE_SPEC.viewThresholds.sideEarToShoulderRatioMax) {
    return "side";
  }

  return "unknown";
}

export function computeScore(
  features: PostureFeatures,
  view: ViewClass,
  baseline: BaselineStats,
  previousEmaScore: number | null,
): ScoreResult {
  const weights = POSTURE_SPEC.weights[view];
  const normalized = normalizeFeatures(features, baseline);

  let scoreRaw = 0;
  for (const key of FEATURE_KEYS) {
    scoreRaw += weights[key] * normalized[key];
  }

  const alpha = POSTURE_SPEC.emaAlpha;
  const scoreEma =
    previousEmaScore === null
      ? scoreRaw
      : alpha * scoreRaw + (1 - alpha) * previousEmaScore;

  return {
    scoreRaw,
    scoreEma,
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
        },
        features: null,
        postureState: next.postureState,
        warmupRemainingMs: remainingWarmupMs(initializedStartMs, nowMs),
        baselineReady: next.baseline !== null,
        usingWorldLandmarks: extracted.usingWorldLandmarks,
      },
    };
  }

  const view = classifyView(extracted.points);

  if (!next.baseline) {
    next = pushWarmupSample(next, extracted.features);

    if (nowMs - initializedStartMs >= POSTURE_SPEC.warmupMs) {
      next = {
        ...next,
        baseline: buildBaseline(next.warmupSamples),
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
        },
        features: extracted.features,
        postureState: next.postureState,
        warmupRemainingMs: remainingWarmupMs(initializedStartMs, nowMs),
        baselineReady: false,
        usingWorldLandmarks: extracted.usingWorldLandmarks,
      },
    };
  }

  const scoreResult = computeScore(
    extracted.features,
    view,
    next.baseline,
    next.emaScore,
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
      },
      features: extracted.features,
      postureState: next.postureState,
      warmupRemainingMs: 0,
      baselineReady: true,
      usingWorldLandmarks: extracted.usingWorldLandmarks,
    },
  };
}

function remainingWarmupMs(startMs: number, nowMs: number) {
  return Math.max(0, POSTURE_SPEC.warmupMs - Math.max(0, nowMs - startMs));
}

function pushWarmupSample(
  state: PostureEngineState,
  features: PostureFeatures,
): PostureEngineState {
  const nextSamples: PostureEngineState["warmupSamples"] = {
    f1: [...state.warmupSamples.f1, features.f1],
    f2: [...state.warmupSamples.f2, features.f2],
    f3: [...state.warmupSamples.f3, features.f3],
    f4: [...state.warmupSamples.f4, features.f4],
    f5: [...state.warmupSamples.f5, features.f5],
  };

  return {
    ...state,
    warmupSamples: nextSamples,
  };
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
    f1: Math.abs(features.f1 - baseline.f1.median) / baseline.f1.scale,
    f2: Math.abs(features.f2 - baseline.f2.median) / baseline.f2.scale,
    f3: Math.abs(features.f3 - baseline.f3.median) / baseline.f3.scale,
    f4: Math.abs(features.f4 - baseline.f4.median) / baseline.f4.scale,
    f5: Math.abs(features.f5 - baseline.f5.median) / baseline.f5.scale,
  };
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
