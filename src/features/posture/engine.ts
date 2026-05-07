import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  buildCorePoints,
  pickLandmarkSet,
  pickLandmarkSetFromSource,
} from "./engine.pose.landmarks";
import {
  angleDegBetween2D,
  buildTorsoAxis,
  distance2D,
  dot2D,
  midpoint,
  subtract2D,
} from "./engine.pose.geometry";
import {
  computeHeadForwardAngle3D,
  computeNeckAngle2D,
  computeNeckAngle3D,
  computePostureExperiment,
} from "./engine.pose.metrics";
import {
  buildBaseline,
  buildHeadWidthBaseline,
  pushWarmupSample,
  remainingWarmupMs,
} from "./engine.baseline";
import {
  computeFeatureReliability,
  computeScore,
  getEarToShoulderRatio,
  resolveCandidateBadState,
} from "./engine.score";
import { POSTURE_SPEC } from "./engine.spec";
import {
  areBothShouldersUsable,
  forceBadState,
  updatePostureState,
  updateShoulderDropMonitor,
} from "./engine.state";
import type {
  BodyTurnSource,
  ExtractFeatureResult,
  ExtractedPoints,
  LandmarkSelection,
  PostureEngineState,
  PostureExperimentMetrics,
  PostureFeatures,
  PostureFrameResult,
  ViewClass,
} from "./engine.types";
import { isFiniteNumber } from "./utils/math";

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
  return safeAsymmetryRatio(distL, distR);
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
    const ratio = safeAsymmetryRatio(distL, distR);
    if (ratio === null) return true;
    return ratio < POSTURE_SPEC.turnThresholds.shoulderXAsymmetry;
  }
}

function safeAsymmetryRatio(a: number, b: number): number | null {
  const min = Math.min(a, b);
  const max = Math.max(a, b);

  if (max < 1e-6) {
    return null;
  }

  return min / max;
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

  if (!extracted.qualityOk) {
    next = updatePostureState(next, false, false, nowMs);
    if (next.shoulderDropActive) {
      next = forceBadState(next, nowMs);
    }
    return buildNonReadyFrameResult(
      next,
      nowMs,
      initializedStartMs,
      extracted.usingWorldLandmarks,
      experiment,
      {
        view: "unknown",
        isHeadTurned: false,
        headYawRatio: null,
        headWidthRatio: null,
        features: null,
        baselineReady: next.baseline !== null,
      },
    );
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
    return buildNonReadyFrameResult(
      next,
      nowMs,
      initializedStartMs,
      extracted.usingWorldLandmarks,
      experiment,
      {
        view,
        isHeadTurned,
        headYawRatio,
        headWidthRatio,
        features: extracted.features,
        baselineReady: false,
      },
    );
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

function buildNonReadyFrameResult(
  state: PostureEngineState,
  nowMs: number,
  initializedStartMs: number,
  usingWorldLandmarks: boolean,
  experiment: PostureExperimentMetrics,
  payload: {
    view: ViewClass;
    isHeadTurned: boolean;
    headYawRatio: number | null;
    headWidthRatio: number | null;
    features: PostureFeatures | null;
    baselineReady: boolean;
  },
): { state: PostureEngineState; result: PostureFrameResult } {
  return {
    state,
    result: {
      eval: {
        score: state.emaScore ?? 0,
        candidateBad: state.shoulderDropActive || state.candidateBadState,
        qualityOk: false,
        view: payload.view,
        isHeadTurned: payload.isHeadTurned,
        headYawRatio: payload.headYawRatio,
        headWidthRatio: payload.headWidthRatio,
        headWidthScale: null,
        headWidthScoreBoost: 0,
      },
      features: payload.features,
      postureState: state.postureState,
      warmupRemainingMs: remainingWarmupMs(initializedStartMs, nowMs),
      baselineReady: payload.baselineReady,
      usingWorldLandmarks,
      experiment,
    },
  };
}
