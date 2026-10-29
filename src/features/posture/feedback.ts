/** Observations for dialogue only. Never feeds back into the posture score. */
export type Reason = 'faceNear' | 'headForward' | 'headTilt' | 'bodyTilt';
export const REASONS: Reason[] = ['faceNear', 'headForward', 'headTilt', 'bodyTilt'];
export type Evidence = Record<Reason, number | null>;
export const emptyEvidence = (): Evidence => ({ faceNear: null, headForward: null, headTilt: null, bodyTilt: null });
type Landmark = { x: number; y: number; z: number; visibility?: number };
type Metrics = { ear: number; eye: number; shoulder: number; yaw: number; earRoll: number; eyeRoll: number; bodyRoll: number | null; forward: number | null; facingX: number | null; facingZ: number | null };
type Key = keyof Metrics;
export type FeedbackBaseline = { version: 1; camera: string; values: Record<Key, { median: number; mad: number } | null> };
export type FeedbackObservation = { epoch: number; evidence: Evidence; baselineReady: boolean; available: boolean };
const keys: Key[] = ['ear', 'eye', 'shoulder', 'yaw', 'earRoll', 'eyeRoll', 'bodyRoll', 'forward', 'facingX', 'facingZ'];
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
  if (wn && wel && wer && wsl && wsr && whl && whr && hm) {
    const we = mid(wel, wer), ws = mid(wsl, wsr), wh = mid(whl, whr), span = distance(wsl, wsr);
    const dx = wn.x - we.x, dz = wn.z - we.z, length = Math.hypot(dx, dz), torsoY = ws.y - wh.y;
    if (span > .1 && length > .025 && Math.abs(torsoY) > .1) {
      facingX = dx / length; facingZ = dz / length;
      const along = (we.y - ws.y) / torsoY;
      forward = ((we.x - ws.x - along * (ws.x - wh.x)) * facingX + (we.z - ws.z - along * (ws.z - wh.z)) * facingZ) / span;
    }
  }
  return { ear: ear / width, eye: eye / width, shoulder: shoulder / width, yaw, earRoll: roll(el, er), eyeRoll: roll(il, ir), bodyRoll, forward, facingX, facingZ };
}

/** Conservative initial thresholds, not probabilities or validated medical cutoffs. */
export function classifyEvidence(m: Metrics | null, baseline: FeedbackBaseline | null, camera: string): Evidence {
  const out = emptyEvidence();
  if (!m || !baseline || baseline.version !== 1 || camera !== baseline.camera) return out;
  const b = baseline.values;
  // Face turning invalidates frontal scale/roll comparisons; shoulders alone cannot resolve it.
  if (!b.yaw || m.yaw > .22 || Math.abs(m.yaw - b.yaw.median) > .12) return out;
  if (b.ear && b.eye && b.shoulder && b.ear.median > 0 && b.eye.median > 0 && b.shoulder.median > 0) {
    const earScale = m.ear / b.ear.median, eyeScale = m.eye / b.eye.median, shoulderScale = m.shoulder / b.shoulder.median;
    // Uniform zoom/body translation is ambiguous: require face growth relative to shoulders too.
    out.faceNear = Math.max(0, Math.min((earScale - 1) / Math.max(.18, 5 * b.ear.mad / b.ear.median), (eyeScale - 1) / Math.max(.18, 5 * b.eye.mad / b.eye.median), (Math.min(earScale, eyeScale) / shoulderScale - 1) / .12));
    if (Math.abs(earScale - eyeScale) > .15 || shoulderScale < .8 || shoulderScale > 1.25) out.faceNear = null;
  }
  if (b.earRoll && b.eyeRoll) {
    const a = m.earRoll - b.earRoll.median, c = m.eyeRoll - b.eyeRoll.median;
    out.headTilt = Math.sign(a) === Math.sign(c) && Math.abs(a - c) < 8 ? Math.min(Math.abs(a) / Math.max(12, b.earRoll.mad * 5), Math.abs(c) / Math.max(12, b.eyeRoll.mad * 5)) : 0;
  }
  if (m.bodyRoll !== null && b.bodyRoll) out.bodyTilt = Math.abs(m.bodyRoll - b.bodyRoll.median) / Math.max(10, b.bodyRoll.mad * 5);
  if (m.forward !== null && b.forward && m.facingX !== null && m.facingZ !== null && b.facingX && b.facingZ && m.facingX * b.facingX.median + m.facingZ * b.facingZ.median > .94) {
    out.headForward = Math.max(0, (m.forward - b.forward.median) / Math.max(.18, b.forward.mad * 5));
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
      this.baseline = { version: 1, camera: key, values }; this.samples = [];
    }
    return { epoch: this.epoch, baselineReady: !!this.baseline, available: m !== null, evidence: classifyEvidence(m, this.baseline, key) };
  }
}
