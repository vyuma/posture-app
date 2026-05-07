import {
  areCorePointsFromWorld,
  isUsablePoint,
} from "./engine.pose.landmarks";
import { distance2D } from "./engine.pose.geometry";
import { FEATURE_KEYS, POSTURE_SPEC } from "./engine.spec";
import type {
  BaselineStats,
  BodyTurnSource,
  FeatureKey,
  FeatureReliabilityMap,
  FeatureStats,
  LandmarkSelection,
  NormalizedFeatureMap,
  PickedPoint,
  PostureFeatures,
  ScoreResult,
  ViewClass,
} from "./engine.types";
import { clamp, isFiniteNumber } from "./utils/math";

export function computeScore(
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
  const weights: Record<FeatureKey, number> = {
    ...POSTURE_SPEC.weights[weightProfile],
  };

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

export function computeFeatureReliability(
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

export function getEarToShoulderRatio(points: {
  EL: { x: number; y: number };
  ER: { x: number; y: number };
  SL: { x: number; y: number };
  SR: { x: number; y: number };
}) {
  const shoulderSpan = distance2D(points.SL, points.SR);
  const earSpan = distance2D(points.EL, points.ER);
  const shoulderSafe = Math.max(shoulderSpan, POSTURE_SPEC.minShoulderSpan);
  return earSpan / shoulderSafe;
}

export function resolveCandidateBadState(
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

function lerp(min: number, max: number, t: number) {
  return min + (max - min) * clamp(t, 0, 1);
}
