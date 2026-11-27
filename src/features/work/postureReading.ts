import type { RuntimeSnapshot } from '../posture/types';
import type { SpeechCode } from '../posture/feedbackSpeech';
import { REASONS, type Reason, type Evidence } from '../posture/feedback';
import type { Reading } from './model';

export type PostureSample = Pick<RuntimeSnapshot, 'observedAtMs' | 'trackingIntervalMs' | 'qualityOk' | 'baselineReady' | 'postureState' | 'trackingStatus' | 'presentationPosture'>;
export const observationMaxAge = (s: PostureSample) => Math.max(1500, s.trackingIntervalMs * 3);
export function observationFresh(s: PostureSample, now: number) {
  return s.baselineReady && s.observedAtMs !== undefined && now >= s.observedAtMs && now - s.observedAtMs <= observationMaxAge(s);
}
export function measurementReading(s: PostureSample & Pick<RuntimeSnapshot, 'score' | 'feedback'>, now: number, warning?: SpeechCode | null): Reading {
  const valid = observationFresh(s, now) && s.qualityOk;
  const feedback = valid && s.feedback?.baselineReady && s.feedback.available ? {
    ...(warning === undefined ? {} : { warning: s.postureState === 'bad' && warning && REASONS.includes(warning as Reason) &&
      (s.feedback.causes?.includes(warning as Reason) ?? (s.feedback.evidence[warning as Reason] ?? 0) >= 1) ? warning as Reason : null }),
    recoveryEvidence: { ...(s.feedback.recoveryEvidence ?? s.feedback.evidence) },
    version: s.feedback.causes ? 3 as const : 2 as const, observedAtMs: s.observedAtMs!, directions: { ...s.feedback.directions },
    evidence: Object.fromEntries(REASONS.map(reason => {
      const value = s.feedback!.evidence[reason];
      return [reason, value !== null && Number.isFinite(value) ? s.feedback!.causes && !s.feedback!.causes.includes(reason) ? 0 : Math.round(Math.min(100, Math.max(0, value)) * 100) / 100 : null];
    })) as Evidence,
  } : undefined;
  return { valid, good: s.postureState === 'good', deviation: s.score, ...(feedback ? { feedback } : {}) };
}
export function petPosture(s: PostureSample, now: number) {
  if (!observationFresh(s, now)) return 'hold';
  if (s.trackingStatus === 'missing') return 'bad';
  if (s.trackingStatus === 'grace') return s.presentationPosture ?? 'hold';
  return s.qualityOk ? s.postureState : 'hold';
}
