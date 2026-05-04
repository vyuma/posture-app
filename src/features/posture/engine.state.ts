import { isUsablePoint } from "./engine.pose.landmarks";
import { POSTURE_SPEC } from "./engine.spec";
import type { LandmarkSelection, PostureEngineState } from "./engine.types";

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

export function areBothShouldersUsable(selected: LandmarkSelection) {
  return isUsablePoint(selected.SL) && isUsablePoint(selected.SR);
}

export function updateShoulderDropMonitor(
  previous: PostureEngineState,
  shouldersVisible: boolean,
  nowMs: number,
): PostureEngineState {
  const deltaMs = boundedDeltaMs(previous.shoulderDropLastTsMs, nowMs);

  const shoulderEstablished = previous.shoulderEstablished || shouldersVisible;
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
