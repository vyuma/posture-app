import type { MeasurementStats, RewardRule } from "../types";

export type MeasurementAccumulator = MeasurementStats & {
  lastSampleAtMs: number | null;
};

export const REWARD_RULE: RewardRule = {
  minDurationMs: 0,
  minGoodRatio: 0.5,
};

export const EMPTY_MEASUREMENT_STATS: MeasurementStats = {
  activeMeasurementMs: 0,
  goodMs: 0,
  goodRatio: 0,
};

export function createMeasurementAccumulator(): MeasurementAccumulator {
  return {
    lastSampleAtMs: null,
    ...EMPTY_MEASUREMENT_STATS,
  };
}

export function toMeasurementStats(
  accumulator: MeasurementAccumulator,
): MeasurementStats {
  const goodRatio =
    accumulator.activeMeasurementMs > 0
      ? accumulator.goodMs / accumulator.activeMeasurementMs
      : 0;

  return {
    activeMeasurementMs: accumulator.activeMeasurementMs,
    goodMs: accumulator.goodMs,
    goodRatio,
  };
}
