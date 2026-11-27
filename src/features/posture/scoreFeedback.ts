import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { FeatureKey, PostureEngineState, PostureFrameResult } from './engine.types';
import { POSTURE_SPEC } from './engine.spec';
import type { FeedbackObservation, Reason } from './feedback';

const featureReasons: Record<FeatureKey, Reason> = {
  headLateralOffsetRatio: 'headShift', earShoulderDistanceRatio: 'headShoulderDistance',
  torsoTiltDeg: 'bodyTilt', neckAngleDeg: 'neckAngle',
  earShoulderAsymmetryRatio: 'earShoulderBalance', headForwardAngleDeg: 'headShoulderAngle',
};

/** Explain the actual decision inputs; separate geometric cues cannot outrank its causes. */
export function explainPostureDecision(feedback: FeedbackObservation, frame: PostureFrameResult, state: PostureEngineState, image: NormalizedLandmark[] | null, scale: number): FeedbackObservation {
  const causes: Reason[] = [], evidence = { ...feedback.evidence }, directions = { ...feedback.directions };
  if (!frame.baselineReady || !frame.eval.qualityOk || !state.baseline || !frame.features) return { ...feedback, causes };
  // Recovery needs uncensored per-feature deviations, even after the combined score becomes GOOD.
  const recoveryEvidence = { ...feedback.evidence };
  for (const [key, component] of Object.entries(frame.eval.scoreBreakdown ?? {})) {
    if (key === 'headWidth') continue;
    const reason = featureReasons[key as FeatureKey];
    if (reason === 'bodyTilt' && ![23,24].every(i => image?.[i] && (image[i].visibility ?? 0) >= POSTURE_SPEC.visibilityThreshold)) continue;
    recoveryEvidence[reason] = Math.max(recoveryEvidence[reason] ?? 0, component.deviation / (POSTURE_SPEC.scoreThresholdGood * scale));
  }
  recoveryEvidence.faceScale = frame.eval.headWidthScale == null ? null : frame.eval.headWidthScoreBoost > 0 ? 1 : 0;
  if (state.headTiltCandidateBad) {
    causes.push('headTilt'); evidence.headTilt = Math.max(1, evidence.headTilt ?? 0);
  }
  if (frame.eval.headTurnCandidateBad) {
    causes.push('headTurn'); evidence.headTurn = Math.max(1, evidence.headTurn ?? 0);
  }
  const rawScore = Object.values(frame.eval.scoreBreakdown ?? {}).reduce((sum, part) => sum + part.contribution, 0);
  // EMA can remain bad after the current evidence has recovered; do not invent a new cause.
  if (state.candidateBadState && rawScore >= POSTURE_SPEC.scoreThresholdGood * scale) {
    const components = Object.entries(frame.eval.scoreBreakdown ?? {}).sort((a,b) => b[1].contribution-a[1].contribution);
    for (const [key, component] of components) {
      if (component.contribution <= 0 || key !== 'headWidth' && component.deviation < POSTURE_SPEC.scoreThresholdGood * scale) continue;
      let reason = key === 'headWidth' ? 'faceScale' : featureReasons[key as FeatureKey];
      if (reason === 'neckAngle' && (evidence.headPitch ?? 0) >= 1) reason = 'headPitch';
      if (reason === 'earShoulderBalance') {
        if ((evidence.shoulderTilt ?? 0) >= 1) reason = 'shoulderTilt';
        else if ((evidence.headTilt ?? 0) >= 1) reason = 'headTilt';
      }
      if (reason === 'faceScale' && (evidence.faceNear ?? 0) >= 1) reason = 'faceNear';
      // A substituted vertical axis is not an observed torso movement.
      if (reason === 'bodyTilt' && ![23,24].every(i => image?.[i] && (image[i].visibility ?? 0) >= POSTURE_SPEC.visibilityThreshold)) continue;
      if (!causes.includes(reason)) causes.push(reason);
      evidence[reason] = Math.max(evidence[reason] ?? 0, key === 'headWidth' ? 1 : component.deviation / (POSTURE_SPEC.scoreThresholdGood * scale));
      if (reason === 'headShift') {
        const side = Math.sign((image?.[11]?.x ?? 0) - (image?.[12]?.x ?? 0));
        const delta = (frame.features.headLateralOffsetRatio-state.baseline.headLateralOffsetRatio.median)*side;
        delete directions.headShift;
        if (delta) directions.headShift = delta > 0 ? 'left' : 'right';
      }
      if (reason === 'headShoulderAngle') {
        const angle = frame.experiment.headShoulderSignedDeg;
        delete directions.headShoulderAngle;
        if (angle != null && angle !== 0) directions.headShoulderAngle = angle > 0 ? 'forward' : 'backward';
      }
    }
  }
  return { ...feedback, recoveryEvidence, causes, evidence, directions, baselineReady: true, available: feedback.available || causes.length > 0 };
}
