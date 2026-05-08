import type {
  MeasurementStats,
  PostureTimelineSegment,
  RewardRule,
} from "../types";

export type MeasurementAccumulator = MeasurementStats & {
  lastSampleAtMs: number | null;
  postureTimeline: PostureTimelineSegment[];
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

export function appendPostureTimelineSlice(
  timeline: PostureTimelineSegment[],
  prevActiveMs: number,
  nextActiveMs: number,
  isGood: boolean,
) {
  if (nextActiveMs <= prevActiveMs || !Number.isFinite(nextActiveMs)) {
    return;
  }

  const last = timeline[timeline.length - 1];
  if (
    last !== undefined &&
    last.endMs === prevActiveMs &&
    last.isGood === isGood
  ) {
    last.endMs = nextActiveMs;
    return;
  }

  timeline.push({
    startMs: prevActiveMs,
    endMs: nextActiveMs,
    isGood,
  });
}

export function finalizePostureTimeline(
  timeline: PostureTimelineSegment[],
  activeMeasurementMs: number,
): PostureTimelineSegment[] {
  if (activeMeasurementMs <= 0 || timeline.length === 0) {
    return [];
  }

  const cloned = timeline.map((segment) => ({ ...segment }));
  const last = cloned[cloned.length - 1];
  if (last !== undefined) {
    last.endMs = activeMeasurementMs;
  }

  return cloned.filter((segment) => segment.endMs > segment.startMs);
}

export function createMeasurementAccumulator(): MeasurementAccumulator {
  return {
    lastSampleAtMs: null,
    postureTimeline: [],
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
