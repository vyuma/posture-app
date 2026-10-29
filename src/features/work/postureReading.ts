import type { RuntimeSnapshot } from '../posture/types';
import type { Reading } from './model';

export type PostureSample = Pick<RuntimeSnapshot, 'observedAtMs' | 'trackingIntervalMs' | 'qualityOk' | 'baselineReady' | 'postureState' | 'trackingStatus' | 'presentationPosture'>;
export const observationMaxAge = (s: PostureSample) => Math.max(1500, s.trackingIntervalMs * 3);
export function observationFresh(s: PostureSample, now: number) {
  return s.baselineReady && s.observedAtMs !== undefined && now >= s.observedAtMs && now - s.observedAtMs <= observationMaxAge(s);
}
export function measurementReading(s: PostureSample & Pick<RuntimeSnapshot, 'score'>, now: number): Reading {
  return { valid: observationFresh(s, now) && s.qualityOk, good: s.postureState === 'good', deviation: s.score };
}
export function petPosture(s: PostureSample, now: number) {
  if (!observationFresh(s, now)) return 'hold';
  if (s.trackingStatus === 'missing') return 'bad';
  if (s.trackingStatus === 'grace') return s.presentationPosture ?? 'hold';
  return s.qualityOk ? s.postureState : 'hold';
}
