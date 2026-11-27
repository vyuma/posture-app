import type { Directions, Reason } from './feedback';

/** Prefer the observed forward movement over its coincident distance cue, only for explanations. */
export function preferredFeedbackReason(reason: Reason, active: readonly Reason[], directions: Directions = {}): Reason {
  if (reason !== 'headShoulderDistance') return reason;
  return active.find(candidate => candidate === 'headForward' ||
    candidate === 'headShoulderAngle' && directions.headShoulderAngle === 'forward') ?? reason;
}
