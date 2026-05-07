import { FEATURE_KEYS, POSTURE_SPEC } from "./engine.spec";
import type {
  BaselineStats,
  FeatureKey,
  PostureEngineState,
  PostureFeatures,
} from "./engine.types";
import { isFiniteNumber } from "./utils/math";

export function remainingWarmupMs(startMs: number, nowMs: number) {
  return Math.max(0, POSTURE_SPEC.warmupMs - Math.max(0, nowMs - startMs));
}

export function pushWarmupSample(
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

export function buildHeadWidthBaseline(samples: number[]) {
  const usable = samples.filter((value) => isFiniteNumber(value) && value > 0);
  if (usable.length === 0) {
    return null;
  }

  return median(usable);
}

export function buildBaseline(
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
