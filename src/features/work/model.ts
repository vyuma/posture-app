import type { FeedbackBaseline } from '../posture/feedback';
import type { BaselineStats } from '../posture/engine.types';

export type Grade = 1 | 2 | 3 | 4 | 5;
export type TimerSettings = { focusMinutes: number; restMinutes: number; cycles: number };
export const DEFAULT_TIMER: TimerSettings = { focusMinutes: 35, restMinutes: 5, cycles: 4 };
export const TIMER_MAX = { focusMinutes: 120, restMinutes: 60, cycles: 12 } as const;
export function clampTimerValue(key: keyof TimerSettings, value: number) {
  return Number.isNaN(value) ? 1 : Math.max(1, Math.min(TIMER_MAX[key], Math.trunc(value)));
}
export function normalizeTimer(timer: TimerSettings): TimerSettings {
  const cycles = clampTimerValue('cycles', timer.cycles);
  return { focusMinutes: clampTimerValue('focusMinutes', timer.focusMinutes),
    restMinutes: cycles === 1 ? 0 : clampTimerValue('restMinutes', timer.restMinutes), cycles };
}
export const SCORE_VERSION = 'baseline-distance-v1';
export type Baseline = { stats: BaselineStats; headWidthRatio: number | null; feedback?: FeedbackBaseline };
export type Calibration = { id: string; focusMs: number; elapsedMs: number; baseline: Baseline; scoreVersion: string };
export type Sample = { sequence: number; focusMs: number; elapsedMs: number; calibrationId: string; segment: number; score: number | null; deviation: number | null; state: 'good' | 'bad' | 'untracked' };
export type EventKind = 'start' | 'rest' | 'focus' | 'pause' | 'resume' | 'recalibrate' | 'calibrated' | 'calibration_cancelled' | 'tracking_lost' | 'tracking_restored' | 'finish';
export type SessionEvent = { kind: EventKind; focusMs: number; elapsedMs: number; segment: number };
export type Session = {
  id: string; startedAt: string; endedAt: string | null; status: 'running' | 'paused' | 'recalibrating' | 'completed' | 'interrupted';
  settings: TimerSettings; phase: 'focus' | 'rest'; cycle: number; remainingMs: number;
  ratioBasis?: 'focus-v1';
  focusMs: number; validMs: number; goodMs: number; elapsedMs: number; generation: number;
  calibrations: Calibration[]; samples: Sample[]; events: SessionEvent[]; segment: number;
  acquiredCharacterId: string | null; rewardQualified: boolean; legacy?: boolean; legacyGoodRatio?: number;
  lastTickMs: number | null; wasPaused: boolean; lastSampleFocusMs: number; tracking: boolean | null;
};
export type Card = { characterId: string; measurementId: string; acquiredAt: string; generation: number };
export type Collection = { revision: number; generation: number; cards: Card[]; selectedId: string | null; timer: TimerSettings | null; migrated: boolean; nextRewardId?: string | null };
export const EMPTY_COLLECTION: Collection = { revision: 0, generation: 0, cards: [], selectedId: null, timer: null, migrated: false };
export type Reading = { valid: boolean; good: boolean; deviation: number };
export const NO_READING: Reading = { valid: false, good: false, deviation: 0 };
export const displayScore = (deviation: number) => Math.max(0, Math.min(100, 100 - deviation / 1.6 * 50));
export function goodRatio(session: Pick<Session, 'validMs' | 'goodMs'> & Partial<Pick<Session, 'focusMs' | 'ratioBasis' | 'legacyGoodRatio'>>) {
  if (session.legacyGoodRatio !== undefined) return session.legacyGoodRatio;
  // Saved sessions without the new policy retain their original result.
  const denominator = session.ratioBasis === 'focus-v1' ? session.focusMs ?? 0 : session.validMs;
  return session.validMs > 0 && denominator > 0 ? session.goodMs / denominator : null;
}
export function timerValid(timer: TimerSettings) {
  return Number.isInteger(timer.focusMinutes) && timer.focusMinutes >= 1 && timer.focusMinutes <= TIMER_MAX.focusMinutes
    && (timer.cycles === 1 ? timer.restMinutes === 0 : Number.isInteger(timer.restMinutes) && timer.restMinutes >= 1 && timer.restMinutes <= TIMER_MAX.restMinutes)
    && Number.isInteger(timer.cycles) && timer.cycles >= 1 && timer.cycles <= 12;
}
export function createSession(id: string, settings: TimerSettings, generation: number, baseline: Baseline, now = Date.now()): Session {
  settings = normalizeTimer(settings);
  return { id, startedAt: new Date(now).toISOString(), endedAt: null, status: 'running', settings: { ...settings },
    ratioBasis: 'focus-v1', phase: 'focus', cycle: 1, remainingMs: settings.focusMinutes * 60_000, focusMs: 0, validMs: 0, goodMs: 0,
    elapsedMs: 0, generation, calibrations: [{ id: `${id}:baseline:0`, focusMs: 0, elapsedMs: 0, baseline, scoreVersion: SCORE_VERSION }],
    samples: [], events: [{ kind: 'start', focusMs: 0, elapsedMs: 0, segment: 0 }], segment: 0,
    acquiredCharacterId: null, rewardQualified: false, lastTickMs: null, wasPaused: false, lastSampleFocusMs: -1000, tracking: null };
}
function event(session: Session, kind: EventKind) {
  session.segment += 1;
  session.events.push({ kind, focusMs: session.focusMs, elapsedMs: session.elapsedMs, segment: session.segment });
  session.lastSampleFocusMs = -1000;
}
function sample(session: Session, reading: Reading, force = false) {
  if (!force && session.focusMs - session.lastSampleFocusMs < 1000) return;
  const previous = session.samples[session.samples.length - 1];
  if (previous && previous.focusMs === session.focusMs && previous.segment === session.segment && previous.state === (reading.valid ? reading.good ? 'good' : 'bad' : 'untracked')) return;
  session.samples.push({ sequence: session.samples.length, focusMs: session.focusMs, elapsedMs: session.elapsedMs,
    calibrationId: session.calibrations[session.calibrations.length - 1]?.id ?? '', segment: session.segment,
    score: reading.valid ? displayScore(reading.deviation) : null, deviation: reading.valid ? reading.deviation : null,
    state: reading.valid ? reading.good ? 'good' : 'bad' : 'untracked' });
  session.lastSampleFocusMs = session.focusMs;
}
/** One owner advances the clock; delayed ticks never turn a stale camera frame into good time. */
export function advanceSession(session: Session, nowMs: number, reading: Reading): Session {
  if (session.status === 'completed' || session.status === 'interrupted') return session;
  const previousTick = session.lastTickMs;
  session.lastTickMs = nowMs;
  if (previousTick === null) { if (session.status === 'running' && session.phase === 'focus') sample(session, reading); return session; }
  let delta = Math.max(0, nowMs - previousTick);
  if (session.status !== 'running') { session.elapsedMs += delta; return session; }
  const observed = delta <= 1500 ? reading : NO_READING;
  while (delta > 0 && session.status === 'running') {
    const portion = Math.min(delta, session.remainingMs);
    if (session.phase === 'focus') {
      if (session.tracking !== observed.valid) {
        if (session.tracking !== null) event(session, observed.valid ? 'tracking_restored' : 'tracking_lost');
        session.tracking = observed.valid;
        sample(session, observed, true);
      }
      session.focusMs += portion;
      if (observed.valid) { session.validMs += portion; if (observed.good) session.goodMs += portion; }
    }
    session.elapsedMs += portion;
    session.remainingMs -= portion;
    delta -= portion;
    if (session.phase === 'focus') sample(session, observed, session.remainingMs <= 0);
    if (session.remainingMs <= 0) {
      if (session.phase === 'focus' && session.cycle === session.settings.cycles) finishSession(session);
      else {
        session.phase = session.phase === 'focus' ? 'rest' : 'focus';
        if (session.phase === 'focus') session.cycle += 1;
        session.remainingMs = (session.phase === 'focus' ? session.settings.focusMinutes : session.settings.restMinutes) * 60_000;
        event(session, session.phase); session.tracking = null;
        if (session.phase === 'focus') sample(session, observed, true);
      }
    }
  }
  return session;
}
export function pauseSession(session: Session, reading: Reading) {
  if (session.status !== 'running') return;
  if (session.phase === 'focus') sample(session, reading, true);
  event(session, 'pause'); session.status = 'paused';
}
export function resumeSession(session: Session) {
  if (session.status !== 'paused') return;
  event(session, 'resume'); session.status = 'running'; session.lastTickMs = null; session.tracking = null;
}
export function beginCalibration(session: Session, reading: Reading) {
  session.wasPaused = session.status === 'paused';
  if (session.phase === 'focus' && session.status === 'running') sample(session, reading, true);
  event(session, 'recalibrate'); session.status = 'recalibrating';
}
export function endCalibration(session: Session, baseline: Baseline | null) {
  if (baseline) session.calibrations.push({ id: `${session.id}:baseline:${session.calibrations.length}`, focusMs: session.focusMs,
    elapsedMs: session.elapsedMs, baseline, scoreVersion: SCORE_VERSION });
  event(session, baseline ? 'calibrated' : 'calibration_cancelled');
  session.status = session.wasPaused ? 'paused' : 'running'; session.lastTickMs = null; session.tracking = null;
}
export function finishSession(session: Session, endedAt = new Date().toISOString(), reading?: Reading) {
  if (session.status === 'completed' || session.status === 'interrupted') return;
  if (reading && session.status === 'running' && session.phase === 'focus') sample(session, reading, true);
  session.status = 'completed'; session.endedAt = endedAt; session.lastTickMs = null;
  session.rewardQualified = session.validMs > 0 && (goodRatio(session) ?? 0) >= 0.5;
  event(session, 'finish');
}
export function chooseReward(cards: Card[], catalogIds: string[], random = Math.random): string | null {
  if (!cards.length && catalogIds.includes('normal-nago')) return 'normal-nago';
  const acquired = new Set(cards.map(card => card.characterId));
  const remaining = catalogIds.filter(id => !acquired.has(id));
  return remaining.length ? remaining[Math.min(remaining.length - 1, Math.floor(Math.max(0, random()) * remaining.length))] : null;
}
export const timeLabel = (ms: number) => `${Math.floor(Math.max(0, Math.ceil(ms / 1000)) / 60)}:${String(Math.max(0, Math.ceil(ms / 1000)) % 60).padStart(2, '0')}`;
export const minutesLabel = (ms: number) => `${Math.floor(ms / 60_000)}分`;
