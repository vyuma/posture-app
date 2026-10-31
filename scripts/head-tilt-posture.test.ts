import { describe, expect, test } from 'bun:test';
import { createPostureEngineState } from '../src/features/posture/engine';
import { FeedbackObserver } from '../src/features/posture/feedback';
import { evaluatePostureObservation } from '../src/features/posture/observation';
import { measurementReading, petPosture } from '../src/features/work/postureReading';
import { advanceSession, createSession, goodRatio } from '../src/features/work/model';

const camera = { width: 1280, height: 720, id: 'test-camera' };
function landmarks(angle = 0, mirror = false) {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [i, x, y] of [[0,.5,.24],[7,.43,.24],[8,.57,.24],[2,.47,.22],[5,.53,.22],[11,.35,.45],[12,.65,.45],[23,.4,.8],[24,.6,.8]]) points[i] = { x, y, z: 0, visibility: 1 };
  for (const i of [7, 8, 2, 5]) points[i].y += (points[i].x-.5)*camera.width/camera.height*Math.tan(angle*Math.PI/180);
  return points.map(p => ({ ...p, x: mirror ? 1-p.x : p.x }));
}
function world() {
  const p = landmarks().map(v => ({ ...v, x: v.x-.5, y: v.y-.8 }));
  p[0].z = -.1; p[7].z = p[8].z = -.04;
  return p;
}
function session(mirror = false, baselineAngle = 0) {
  let state = createPostureEngineState(), now = -100;
  const observer = new FeedbackObserver();
  const step = (angle: number, extra?: { hidden?: boolean; id?: string; gap?: number }) => {
    now += extra?.gap ?? 100;
    const image = landmarks(angle, mirror);
    if (extra?.hidden) image[2].visibility = .2;
    const out = evaluatePostureObservation(state, observer, now, image, world(), { ...camera, id: extra?.id ?? camera.id });
    state = out.state;
    return { ...out, now };
  };
  for (let i=0; i<61; i++) step(baselineAngle);
  return { step };
}

describe('head tilt uses the same left/right evidence for posture and rate', () => {
  test('the first ready frame captures tilt calibration for session restore', () => {
    let state = createPostureEngineState();
    const observer = new FeedbackObserver();
    for (let now=0; now<=6000; now+=100) {
      const out = evaluatePostureObservation(state, observer, now, landmarks(), world(), camera);
      state = out.state;
      if (!out.result.baselineReady) continue;
      const baseline = observer.capture();
      expect(baseline).toBeDefined();
      expect(out.feedback.baselineReady).toBe(true);
      const restored = new FeedbackObserver();
      restored.reset(baseline);
      let measured = out;
      for (let i=1; i<=16; i++) {
        measured = evaluatePostureObservation(state, restored, now+i*100, landmarks(18), world(), camera);
        state = measured.state;
      }
      expect(measured.result.postureState).toBe('bad');
      return;
    }
    throw new Error('Calibration did not complete');
  });
  for (const angle of [-18, 18]) for (const mirror of [false, true]) {
    test(`${angle} degrees, mirrored=${mirror}: sustained tilt becomes bad and never counts as good`, () => {
      const s = session(mirror);
      let out = s.step(angle);
      expect(out.result.postureState).toBe('good');
      for (let i=0; i<15; i++) out=s.step(angle);
      expect(out.feedback.evidence.headTilt).toBeCloseTo(1.5);
      expect(out.result.postureState).toBe('bad');
      expect(out.result.presentationPosture).toBe('bad');
      expect(out.result.eval.candidateBad).toBe(true);
      const snapshot = { ...out.result, observedAtMs: out.now, trackingIntervalMs: 100,
        qualityOk: out.result.eval.qualityOk, score: out.result.eval.score };
      const reading = measurementReading(snapshot, out.now);
      expect(petPosture(snapshot, out.now)).toBe('bad');
      expect(reading).toMatchObject({ valid: true, good: false });
      const record = createSession('tilt', { focusMinutes: 1, restMinutes: 0, cycles: 1 }, 0,
        { stats: out.state.baseline!, headWidthRatio: out.state.baselineHeadWidthRatio });
      advanceSession(record, 0, { ...reading, good: true });
      advanceSession(record, 1000, { ...reading, good: true });
      const before = record.goodMs;
      advanceSession(record, 2000, reading);
      expect(record.goodMs).toBe(before);
      expect(goodRatio(record)).toBe(.5);
    });
  }
  test('brief tilt, missing eyes, camera changes and observation gaps cannot establish sustained tilt', () => {
    const s=session();
    for (let i=0; i<5; i++) expect(s.step(18).result.postureState).toBe('good');
    for (let i=0; i<15; i++) expect(s.step(0).result.postureState).toBe('good');
    for (let i=0; i<15; i++) expect(s.step(18,{hidden:true}).result.postureState).toBe('good');
    for (let i=0; i<15; i++) expect(s.step(18,{id:'changed'}).result.postureState).toBe('good');
    const interrupted=session();
    for(let i=0;i<9;i++) interrupted.step(18);
    expect(interrupted.step(18,{gap:2000}).result.postureState).toBe('good');
  });
  test('hysteresis holds near the boundary, and a stable return recovers', () => {
    const s=session();
    for(let i=0;i<16;i++) s.step(18);
    for(let i=0;i<10;i++) expect(s.step(10).result.postureState).toBe('bad');
    expect(s.step(0).result.postureState).toBe('bad');
    let out=s.step(0);
    for(let i=0;i<5;i++) out=s.step(0);
    expect(out.result.postureState).toBe('good');
  });
  test('left and right departures are measured relative to the registered pose', () => {
    for (const direction of [-1, 1]) {
      const s=session(false, 6);
      let out=s.step(6+18*direction);
      for(let i=0;i<15;i++) out=s.step(6+18*direction);
      expect(out.feedback.evidence.headTilt).toBeCloseTo(1.5);
      expect(out.result.postureState).toBe('bad');
    }
  });
});
