import { relativeHeadYaw } from './judgment';
/** Calibrated observations for dialogue. Head tilt also informs the bad/good decision; weighted score stays separate. */
export type Reason = 'faceNear' | 'headForward' | 'headTilt' | 'bodyTilt' | 'headShift' | 'headPitch' | 'shoulderTilt' | 'headTurn' | 'headShoulderAngle' | 'headShoulderDistance' | 'neckAngle' | 'earShoulderBalance' | 'faceScale';
export type Direction = 'left' | 'right' | 'up' | 'down' | 'forward' | 'backward';
export type Directions = Partial<Record<Reason, Direction>>;
export const REASONS: Reason[] = ['faceNear', 'headForward', 'headTilt', 'bodyTilt', 'headShift', 'headPitch', 'shoulderTilt', 'headTurn', 'headShoulderAngle', 'headShoulderDistance', 'neckAngle', 'earShoulderBalance', 'faceScale'];
export type Evidence = Record<Reason, number | null>;
export const emptyEvidence = (): Evidence => ({ faceNear: null, headForward: null, headTilt: null, bodyTilt: null, headShift: null, headPitch: null, shoulderTilt: null, headTurn: null, headShoulderAngle: null, headShoulderDistance: null, neckAngle: null, earShoulderBalance: null, faceScale: null });
type Landmark = { x: number; y: number; z: number; visibility?: number };
type Metrics = { ear: number; eye: number; shoulder: number; yaw: number; earRoll: number; eyeRoll: number; bodyRoll: number | null; forward: number | null; facingX: number | null; facingZ: number | null } & Record<ExtraKey, number | null>;
type ExtraKey = 'forwardAligned' | 'forwardUpper' | 'headSide' | 'bodySide' | 'shift' | 'pitch' | 'shoulderSide' | 'turn';
type Key = keyof Metrics;
// Existing floors remain unchanged; new cues start conservatively and need camera calibration.
export const FEEDBACK_SPEC = { headTiltDeg: 12, bodyTiltDeg: 10, forwardRatio: .18, headShiftRatio: .12, headPitchDeg: 12, shoulderTiltDeg: 8, turnRatio: .22, turnChange: .12, release: .65, releaseMs: 350 } as const;
export type FeedbackBaseline = { version: 1 | 2; camera: string; values: Partial<Record<Key, { median: number; mad: number } | null>> };
export type FeedbackObservation = { recoveryEvidence?: Evidence; causes?: Reason[]; headYawDeg?: number | null; epoch: number; evidence: Evidence; directions?: Directions; baselineReady: boolean; available: boolean };
const keys: Key[] = ['ear', 'eye', 'shoulder', 'yaw', 'earRoll', 'eyeRoll', 'bodyRoll', 'forward', 'facingX', 'facingZ', 'forwardAligned', 'forwardUpper', 'headSide', 'bodySide', 'shift', 'pitch', 'shoulderSide', 'turn'];
const median = (values: number[]) => { const v = [...values].sort((a, b) => a - b); return (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2; };
const point = (points: Landmark[] | null, index: number) => {
  const p = points?.[index];
  return p && [p.x, p.y, p.z, p.visibility].every(v => typeof v === 'number' && Number.isFinite(v)) && p.visibility! >= .7 ? p : null;
};
const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
// Undirected line angle: landmark left/right ordering and mirrored input must agree.
const roll = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan((b.y - a.y) / (b.x - a.x)) * 180 / Math.PI;

export function feedbackMetrics(image: Landmark[] | null, world: Landmark[] | null, width: number, height: number): Metrics | null {
  if (!(width > 0 && height > 0)) return null;
  const pixels = image?.map(p => ({ ...p, x: p.x * width, y: p.y * height, z: 0 })) ?? null;
  const n = point(pixels, 0), el = point(pixels, 7), er = point(pixels, 8), il = point(pixels, 2), ir = point(pixels, 5), sl = point(pixels, 11), sr = point(pixels, 12);
  if (!n || !el || !er || !il || !ir || !sl || !sr) return null;
  if ([n, el, er, il, ir, sl, sr].some(p => p.x <= 0 || p.x >= width || p.y <= 0 || p.y >= height)) return null;
  const ear = distance(el, er), eye = distance(il, ir), shoulder = distance(sl, sr), em = mid(el, er);
  if (ear < 15 || eye < 8 || shoulder < 40) return null;
  const yaw = Math.abs(n.x - em.x) / ear;
  const hl = point(pixels, 23), hr = point(pixels, 24), sm = mid(sl, sr);
  const hm = hl && hr && [hl, hr].every(p => p.x > 0 && p.x < width && p.y > 0 && p.y < height) ? mid(hl, hr) : null;
  const bodyRoll = hm && hm.y - sm.y > shoulder * .4 ? Math.atan2(sm.x - hm.x, hm.y - sm.y) * 180 / Math.PI : null;
  const wn = point(world, 0), wel = point(world, 7), wer = point(world, 8), wsl = point(world, 11), wsr = point(world, 12), whl = point(world, 23), whr = point(world, 24);
  let forward: number | null = null, facingX: number | null = null, facingZ: number | null = null;
  let forwardAligned: number | null = null, forwardUpper: number | null = null, pitch: number | null = null;
  if (wn && wel && wer && wsl && wsr) {
    const we = mid(wel, wer), ws = mid(wsl, wsr), span = distance(wsl, wsr);
    const dx = wn.x - we.x, dz = wn.z - we.z, length = Math.hypot(dx, dz);
    if (span > .1 && length > .025) {
      facingX = dx / length; facingZ = dz / length;
      forwardUpper = ((we.x - ws.x) * facingX + (we.z - ws.z) * facingZ) / span;
      const pitchRadians = Math.atan2(wn.y - we.y, length);
      pitch = pitchRadians * 180 / Math.PI;
      // A rigid upper-body pitch changes raw depth, but not this head-aligned offset.
      forwardAligned = forwardUpper * Math.cos(pitchRadians) - (ws.y - we.y) / span * Math.sin(pitchRadians);
      if (whl && whr && hm) {
        const wh = mid(whl, whr), torsoY = ws.y - wh.y;
        if (Math.abs(torsoY) > .1) {
          const along = (we.y - ws.y) / torsoY;
          forward = ((we.x - ws.x - along * (ws.x - wh.x)) * facingX + (we.z - ws.z - along * (ws.z - wh.z)) * facingZ) / span;
        }
      }
    }
  }
  // Landmark indices name the person's sides, independent of display mirroring.
  const side = Math.sign(sl.x - sr.x);
  const headSide = Math.atan2(el.y - er.y, Math.abs(el.x - er.x)) * 180 / Math.PI;
  const shoulderSide = Math.atan2(sr.y - sl.y, Math.abs(sl.x - sr.x)) * 180 / Math.PI;
  const shift = (em.x - sm.x) * side / shoulder;
  return { forwardAligned, forwardUpper, headSide, bodySide: bodyRoll === null ? null : bodyRoll * side, shift, pitch, shoulderSide, turn: (n.x - em.x) / ear * side, ear: ear / width, eye: eye / width, shoulder: shoulder / width, yaw, earRoll: roll(el, er), eyeRoll: roll(il, ir), bodyRoll, forward, facingX, facingZ };
}

/** Conservative initial thresholds, not probabilities or validated medical cutoffs. */
export function classifyEvidence(m: Metrics | null, baseline: FeedbackBaseline | null, camera: string): Evidence {
  const out = emptyEvidence();
  if (!m || !baseline || ![1, 2].includes(baseline.version) || camera !== baseline.camera) return out;
  const b = baseline.values;
  if (m.turn !== null && b.turn) out.headTurn = Math.min(Math.abs(m.turn) / FEEDBACK_SPEC.turnRatio, Math.abs(m.turn - b.turn.median) / Math.max(FEEDBACK_SPEC.turnChange, 5 * b.turn.mad));
  // Face turning invalidates frontal scale/roll comparisons; shoulders alone cannot resolve it.
  if (!b.yaw || m.yaw > FEEDBACK_SPEC.turnRatio || Math.abs(m.yaw - b.yaw.median) > FEEDBACK_SPEC.turnChange) return out;
  if (b.ear && b.eye && b.shoulder && b.ear.median > 0 && b.eye.median > 0 && b.shoulder.median > 0) {
    const earScale = m.ear / b.ear.median, eyeScale = m.eye / b.eye.median, shoulderScale = m.shoulder / b.shoulder.median;
    // Uniform zoom/body translation is ambiguous: require face growth relative to shoulders too.
    out.faceNear = Math.max(0, Math.min((earScale - 1) / Math.max(.18, 5 * b.ear.mad / b.ear.median), (eyeScale - 1) / Math.max(.18, 5 * b.eye.mad / b.eye.median), (Math.min(earScale, eyeScale) / shoulderScale - 1) / .12));
    if (Math.abs(earScale - eyeScale) > .15 || shoulderScale < .8 || shoulderScale > 1.25) out.faceNear = null;
  }
  if (b.earRoll && b.eyeRoll) {
    const a = m.earRoll - b.earRoll.median, c = m.eyeRoll - b.eyeRoll.median;
    out.headTilt = Math.sign(a) === Math.sign(c) && Math.abs(a - c) < 8 ? Math.min(Math.abs(a) / Math.max(FEEDBACK_SPEC.headTiltDeg, b.earRoll.mad * 5), Math.abs(c) / Math.max(FEEDBACK_SPEC.headTiltDeg, b.eyeRoll.mad * 5)) : 0;
  }
  if (m.bodyRoll !== null && b.bodyRoll) out.bodyTilt = Math.abs(m.bodyRoll - b.bodyRoll.median) / Math.max(FEEDBACK_SPEC.bodyTiltDeg, b.bodyRoll.mad * 5);
  const forwardKey = m.forward !== null && b.forward ? 'forward' : 'forwardUpper';
  const forward = m[forwardKey], baseForward = b[forwardKey];
  if (forward !== null && baseForward && m.facingX !== null && m.facingZ !== null && b.facingX && b.facingZ && m.facingX * b.facingX.median + m.facingZ * b.facingZ.median > .94) {
    const raw = Math.max(0, (forward - baseForward.median) / Math.max(FEEDBACK_SPEC.forwardRatio, baseForward.mad * 5));
    out.headForward = forwardKey === 'forward' ? raw : m.forwardAligned !== null && b.forwardAligned
      ? Math.max(0, Math.min(raw, (m.forwardAligned - b.forwardAligned.median) / Math.max(FEEDBACK_SPEC.forwardRatio, b.forwardAligned.mad * 5))) : null;
  }
  for (const [reason, key, floor] of [['headShift', 'shift', FEEDBACK_SPEC.headShiftRatio], ['headPitch', 'pitch', FEEDBACK_SPEC.headPitchDeg], ['shoulderTilt', 'shoulderSide', FEEDBACK_SPEC.shoulderTiltDeg]] as const) {
    const value = m[key], base = b[key];
    if (value !== null && base) out[reason] = Math.abs(value - base.median) / Math.max(floor, 5 * base.mad);
  }
  return out;
}

export function classifyDirections(m: Metrics | null, baseline: FeedbackBaseline | null): Directions {
  const out: Directions = {};
  if (!m || !baseline) return out;
  for (const [reason, key] of [['headTilt', 'headSide'], ['bodyTilt', 'bodySide'], ['headShift', 'shift'], ['headPitch', 'pitch'], ['shoulderTilt', 'shoulderSide'], ['headTurn', 'turn']] as const) {
    const value = m[key], base = baseline.values[key];
    if (value !== null && base && value !== base.median) out[reason] = reason === 'headPitch' ? value > base.median ? 'down' : 'up' : value > base.median ? 'left' : 'right';
  }
  return out;
}

export class FeedbackObserver {
  private samples: Metrics[] = [];
  private baseline: FeedbackBaseline | null = null;
  private camera = '';
  private epoch = 0;
  private lastAt = -Infinity;
  reset(baseline: FeedbackBaseline | null = null) { this.samples = []; this.baseline = baseline ? structuredClone(baseline) : null; this.camera = baseline?.camera ?? ''; this.lastAt = -Infinity; this.epoch++; }
  capture() { return this.baseline ? structuredClone(this.baseline) : undefined; }
  observe(image: Landmark[] | null, world: Landmark[] | null, width: number, height: number, camera: string, ready: boolean, quality: boolean, at: number): FeedbackObservation {
    const key = `${camera}:${width}x${height}`;
    if (key !== this.camera) { this.reset(); this.camera = key; }
    const m = quality ? feedbackMetrics(image, world, width, height) : null;
    if (!ready && m && at - this.lastAt >= 80) { this.samples.push(m); if (this.samples.length > 70) this.samples.shift(); this.lastAt = at; }
    if (ready && !this.baseline && this.samples.length >= 12) {
      const values = Object.fromEntries(keys.map(k => {
        const v = this.samples.map(s => s[k]).filter((n): n is number => n !== null && Number.isFinite(n));
        const med = median(v);
        return [k, v.length >= 12 ? { median: med, mad: median(v.map(n => Math.abs(n - med))) } : null];
      })) as FeedbackBaseline['values'];
      this.baseline = { version: 2, camera: key, values }; this.samples = [];
    }
    const b = this.baseline?.values;
    const headYawDeg = m?.facingX != null && m?.facingZ != null && b?.facingX && b.facingZ
      ? relativeHeadYaw(m.facingX,m.facingZ,b.facingX.median,b.facingZ.median) : null;
    return { headYawDeg, epoch: this.epoch, baselineReady: !!this.baseline, available: m !== null, directions: classifyDirections(m, this.baseline), evidence: classifyEvidence(m, this.baseline, key) };
  }
}
