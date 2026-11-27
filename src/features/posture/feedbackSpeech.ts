import messages from './postureFeedback.json';
import { FEEDBACK_SPEC, REASONS, type Direction, type Directions, type Evidence, type Reason } from './feedback';
import { preferredFeedbackReason } from './feedbackPriority';
export type SpeechCode = keyof typeof messages;
export type SpeechEvent = { id: string; code: SpeechCode; text: string; startedAt: number; endsAt: number; whileBad?: true };
export const SPEECH_DURATION = 6500;
export const WARNING_SPEECH_DURATION = 15000;
export const isWarningSpeech = (code: SpeechCode) => code === 'general' || code === 'unavailable' || REASONS.some(reason => reason === code);
export const speechDuration = (code: SpeechCode) =>
  isWarningSpeech(code) ? WARNING_SPEECH_DURATION : SPEECH_DURATION;
type Candidate = { below: number | null; active: boolean; strength: number; direction?: Direction };
type Input = { causes?: Reason[]; context: string; sessionId?: string; mode: 'focus' | 'rest' | 'paused' | 'off'; now: number; observedAt: number; maxAge: number; valid: boolean; retain?: boolean; reasonAvailable?: boolean; trackingMissing?: boolean; directions?: Directions; posture: 'good' | 'bad' | 'hold'; evidence: Evidence };
/** One selected reason, independently tracked candidates. Bubble expiry never clears a reason. */
export class FeedbackSpeech {
  private context = '';
  private sessionId = '';
  private initialPraiseAvailable = true;
  private hasAnnounced = false;
  private praisePending = false;
  private mode: Input['mode'] = 'off';
  private lastObservation = -Infinity;
  private focusStarted = 0;
  private selected: SpeechCode | null = null;
  private candidates = this.freshCandidates();
  private goodAt: number | null = null;
  private sequence = 0;
  private speech: SpeechEvent | null = null;
  private freshCandidates() { return Object.fromEntries(REASONS.map(k => [k, { below: null, active: false, strength: 0 }])) as Record<Reason, Candidate>; }
  private choose(code: keyof typeof messages | null, now: number, directions: Directions = {}) {
    // Losing a warning's evidence ends its priority; praise still cannot replay.
    if (code === null) { if (this.selected && isWarningSpeech(this.selected)) this.selected = null; this.speech = null; return; }
    const direction = directions[code as Reason];
    const key = direction ? `${code}${direction[0].toUpperCase()}${direction.slice(1)}` as keyof typeof messages : code;
    const text = messages[key] ?? messages[code];
    if (code === this.selected && (this.speech?.text === text || !this.speech && !isWarningSpeech(code))) return;
    this.selected = code; this.hasAnnounced = true;
    this.speech = code ? { id: `${this.context}:${++this.sequence}`, code, text, startedAt: now, endsAt: now + speechDuration(code), ...(isWarningSpeech(code) ? { whileBad: true as const } : {}) } : null;
  }
  update(input: Input): SpeechEvent | null {
    const { now, observedAt, evidence, mode } = input;
    const sessionId = input.sessionId ?? input.context;
    const newSession = sessionId !== this.sessionId;
    if (newSession) { this.sessionId = sessionId; this.initialPraiseAvailable = true; this.hasAnnounced = false; }
    if (newSession || input.context !== this.context || mode !== this.mode) {
      // Baseline changes and resumed focus are not evidence of posture recovery.
      this.praisePending = mode === 'focus' && (this.initialPraiseAvailable ||
        !newSession && this.mode === 'focus' && this.praisePending && !this.hasAnnounced);
      if (mode !== 'off') this.initialPraiseAvailable = false;
      this.context = input.context; this.mode = mode; this.candidates = this.freshCandidates(); this.selected = null; this.speech = null;
      this.goodAt = null; this.lastObservation = -Infinity; this.focusStarted = now;
    }
    if (mode === 'off') return null;
    if (mode !== 'focus') { this.choose(mode, now); return this.speech; }
    const valid = input.valid && observedAt >= this.focusStarted && now - observedAt <= input.maxAge && observedAt <= now;
    if (!valid) {
      this.candidates = this.freshCandidates(); this.goodAt = null;
      // Brief detector jitter keeps the current utterance and its original expiry.
      if (now - this.lastObservation <= 500) return this.speech;
      this.choose(null, now);
      return this.speech;
    }
    if (observedAt <= this.lastObservation) return this.speech;
    if (observedAt - this.lastObservation > input.maxAge) { this.candidates = this.freshCandidates(); this.goodAt = null; this.choose(null, now); }
    this.lastObservation = observedAt;
    // A brief gap preserves the existing bubble's clock; it cannot mint a praise/reason.
    if (input.retain) {
      this.candidates = this.freshCandidates(); this.goodAt = null;
      return this.speech;
    }
    // Only fresh, valid bad posture can earn a subsequent recovery praise.
    if (input.posture === 'bad') this.praisePending = true;
    if (input.reasonAvailable === false) {
      this.candidates = this.freshCandidates(); this.goodAt = null;
      // Scoring can still establish bad posture when the separate reason observer abstains.
      this.choose(input.posture === 'bad' ? input.trackingMissing ? 'unavailable' : 'general' : null, now);
      return this.speech;
    }
    for (const reason of REASONS) {
      const c = this.candidates[reason], strength = evidence[reason];
      if (strength === null || !Number.isFinite(strength)) { c.active = false; c.below = null; c.strength = 0; continue; }
      c.strength = strength;
      // The authoritative bad transition has already completed its dwell.
      if (strength >= 1) { c.below = null; c.active = true; c.direction = input.directions?.[reason]; }
      else if (strength < FEEDBACK_SPEC.release) { c.below ??= observedAt; if (observedAt - c.below >= FEEDBACK_SPEC.releaseMs) c.active = false; }
      else c.below = null;
    }
    const active = input.causes ?? REASONS.filter(r => this.candidates[r].active).sort((a, b) => this.candidates[b].strength - this.candidates[a].strength);
    const current = active.find(r => r === this.selected);
    const candidate = current ?? active[0];
    const next = candidate ? preferredFeedbackReason(candidate, active, input.directions) : undefined;
    if (input.posture === 'bad') {
      this.goodAt = null;
      this.choose(next ?? 'general', now, next ? { [next]: this.candidates[next].direction } : {});
    } else if (input.posture === 'good') {
      this.goodAt ??= observedAt;
      if (observedAt - this.goodAt >= 350 && this.praisePending) { this.choose('good', now); this.praisePending = false; }
      else if (this.selected !== 'good') this.choose(null, now);
    } else { this.goodAt = null; this.choose(null, now); }
    return this.speech;
  }
}

/** Shared clock-based motion for the live bubble, playback, seeking and export. */
export function speechMotion(event: SpeechEvent | null, now: number, reduced = false, bad = false) {
  const age = event ? now - event.startedAt : -1;
  const persistent = !!event?.whileBad && bad;
  if (!event || age < 0 || (!persistent && now >= event.endsAt)) return { visible: false, opacity: 0, y: 0, angle: 0 };
  if (reduced) return { visible: true, opacity: 1, y: 0, angle: 0 };
  const enter = 1 - (1 - Math.min(1, age / 280)) ** 3;
  const exitProgress = persistent ? 0 : Math.max(0, Math.min(1, (now - (event.endsAt - 320)) / 320));
  const exit = 1 - exitProgress * exitProgress * (3 - 2 * exitProgress);
  const phase = Math.max(0, Math.min(1, (age - 280) / 900));
  const idle = persistent ? Math.sin(Math.max(0, age - 1180) / 2600 * Math.PI * 2) * 1.2 : 0;
  return { visible: true, opacity: enter * exit, y: 3 * (1 - enter) + 3 * (1 - exit), angle: Math.sin(phase * Math.PI * 4) * 1.5 * (1 - phase) + idle };
}
