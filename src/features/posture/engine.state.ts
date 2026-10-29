import { POSTURE_SPEC } from "./engine.spec";
import type { PostureEngineState } from "./engine.types";

export function updatePostureState(
  previous: PostureEngineState,
  qualityOk: boolean,
  candidateBad: boolean,
  nowMs: number,
  allowTransition = true,
): PostureEngineState {
  const deltaMs = boundedDeltaMs(previous.lastTsMs, nowMs);

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

/** Interruptions are not elapsed landmark-loss time. Keep the calibrated baseline. */
export function resetLandmarkTracking(previous: PostureEngineState): PostureEngineState {
  return { ...previous, landmarksEstablished: false, landmarkDropActive: false,
    landmarkMissingSinceMs: null, landmarkRecoverySinceMs: null, landmarkDropLastTsMs: null,
    postureState: "hold", stableState: "good", badAccumMs: 0, goodAccumMs: 0, lastTsMs: null };
}

/** Called only for decoded camera frames, after calibration. */
export function updateLandmarkDropMonitor(
  previous: PostureEngineState,
  landmarksVisible: boolean,
  nowMs: number,
): PostureEngineState {
  if (previous.landmarkDropLastTsMs !== null && nowMs - previous.landmarkDropLastTsMs > 1500) {
    previous = resetLandmarkTracking(previous);
  }
  const landmarksEstablished = previous.landmarksEstablished || landmarksVisible;
  let landmarkDropActive = previous.landmarkDropActive;
  let landmarkMissingSinceMs = previous.landmarkMissingSinceMs;
  let landmarkRecoverySinceMs = previous.landmarkRecoverySinceMs;
  if (landmarksVisible) {
    landmarkMissingSinceMs = null;
    if (landmarkDropActive) {
      landmarkRecoverySinceMs ??= nowMs;
      if (nowMs - landmarkRecoverySinceMs >= POSTURE_SPEC.landmarkDropExitMs) {
        landmarkDropActive = false;
        landmarkRecoverySinceMs = null;
      }
    }
  } else {
    landmarkRecoverySinceMs = null;
    if (landmarksEstablished) {
      landmarkMissingSinceMs ??= nowMs;
      if (nowMs - landmarkMissingSinceMs >= POSTURE_SPEC.landmarkDropEnterMs) landmarkDropActive = true;
    }
  }
  return { ...previous, landmarksEstablished, landmarkDropActive,
    landmarkMissingSinceMs, landmarkRecoverySinceMs, landmarkDropLastTsMs: nowMs };
}

export function forceBadState(state: PostureEngineState, nowMs: number): PostureEngineState {
  return {
    ...state,
    stableState: "bad",
    postureState: "bad",
    badAccumMs: 0,
    goodAccumMs: 0,
    lastTsMs: nowMs,
  };
}

function boundedDeltaMs(previousTsMs: number | null, nowMs: number) {
  if (previousTsMs === null) {
    return 0;
  }

  return Math.max(0, Math.min(1000, nowMs - previousTsMs));
}
