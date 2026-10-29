import { expect, test } from 'bun:test';
import { createPostureEngineState, evaluatePostureFrame } from '../src/features/posture/engine';
import { advanceSession, createSession, finishSession, goodRatio, type Baseline } from '../src/features/work/model';
import { resetLandmarkTracking } from '../src/features/posture/engine.state';
import { VideoFrameGate } from '../src/features/posture/videoFrameGate';
import { measurementReading, petPosture } from '../src/features/work/postureReading';
import { postureSpeechSample } from '../src/features/work/usePostureSpeech';
import { FeedbackSpeech } from '../src/features/posture/feedbackSpeech';
import { emptyEvidence } from '../src/features/posture/feedback';

function pose() {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [i, x, y] of [[0,.5,.20],[7,.43,.24],[8,.57,.24],[11,.35,.45],[12,.65,.45],[23,.4,.8],[24,.6,.8]]) points[i] = { x, y, z: 0, visibility: 1 };
  return points;
}
function camera() {
  let state = createPostureEngineState(), at = 0;
  const frame = (hidden: number[] = [], gap = 100) => {
    at += gap; const points = pose(); hidden.forEach(i => points[i].visibility = 0);
    const out = evaluatePostureFrame(state, at, points, null); state = out.state; return out.result;
  };
  for (let i = 0; i < 65; i++) frame();
  expect(frame().baselineReady).toBe(true);
  return { frame, now: () => at, reset: () => { state = resetLandmarkTracking(state); } };
}

test('brief shoulder loss does not turn a previously good posture bad', () => {
  const c = camera();
  for (let i = 0; i < 8; i++) expect(c.frame([11]).postureState).not.toBe('bad');
  expect(c.frame().postureState).toBe('good');
});

test('no acquisition before tracking is established, including after resume', () => {
  const c = camera(); c.reset();
  for (let i=0;i<30;i++) expect(c.frame([0,7,8,11,12]).trackingStatus).toBe('unavailable');
  expect(c.frame().trackingStatus).toBe('tracked');
});
test('camera interruption cannot count as sustained missing landmarks', () => {
  const c = camera(); c.frame([0]); c.frame([0]);
  expect(c.frame([0],5000).trackingStatus).toBe('unavailable');
  for (let i=0;i<20;i++) expect(c.frame([0]).trackingStatus).toBe('unavailable');
});
test('recovery must stay visible; a single flickering landmark does not clear the warning', () => {
  const c = camera(); for (let i=0;i<15;i++) c.frame([7]);
  expect(c.frame().trackingStatus).toBe('missing');
  expect(c.frame([7]).trackingStatus).toBe('missing');
  for(let i=0;i<10;i++) c.frame();
  expect(c.frame().postureState).toBe('good');
});
test('real engine → UI → speech: brief loss retains, sustained loss warns once, stale frames stay silent', () => {
  const c = camera(), speech = new FeedbackSpeech();
  const step = (hidden:number[] = []) => {
    const r=c.frame(hidden), now=c.now();
    const s={...r,...r.eval,observedAtMs:now,trackingIntervalMs:100,
      feedback:{epoch:1,baselineReady:true,available:r.eval.qualityOk,evidence:emptyEvidence()}};
    const event=speech.update({context:'one',now,mode:'focus',...postureSpeechSample(s,0)});
    return {s,event};
  };
  let seen=step(); for(let i=0;i<5;i++) seen=step();
  const first=seen.event!; expect(first.code).toBe('good');
  for(let i=0;i<5;i++) { seen=step([11]);expect(seen.event?.id).toBe(first.id); expect(petPosture(seen.s,c.now())).toBe('good'); }
  for(let i=0;i<6;i++) seen=step(); expect(seen.event?.id).toBe(first.id);
  for(let i=0;i<12;i++) seen=step([7]);
  const warning=seen.event!; expect(warning.text).toBe('姿勢を戻して！');
  expect(petPosture(seen.s,c.now())).toBe('bad'); expect(measurementReading(seen.s,c.now()).valid).toBe(false);
  for(let i=0;i<40;i++) expect(step([7]).event?.id).toBe(warning.id);
  const stale=step([7]).s;
  expect(petPosture(stale,c.now()+2000)).toBe('hold');
  expect(measurementReading(stale,c.now()+2000).valid).toBe(false);
  expect(speech.update({context:'one',now:c.now()+2000,mode:'focus',...postureSpeechSample(stale,0)})).toBeNull();
});
test('a frozen/ended/muted camera frame is never a fresh inference', () => {
  const gate=new VideoFrameGate();
  expect(gate.accept(1,true)).toBe(true);
  for(let i=0;i<30;i++) expect(gate.accept(1,true)).toBe(false);
  expect(gate.accept(2,false)).toBe(false); expect(gate.accept(2,true)).toBe(true);
  gate.reset(); expect(gate.accept(0,true)).toBe(true);
});
test('old cards and imported ratios keep the original basis', () => {
  expect(goodRatio({goodMs:60000,validMs:60000,focusMs:600000})).toBe(1);
  expect(goodRatio({goodMs:60000,validMs:60000,focusMs:600000,legacyGoodRatio:.88})).toBe(.88);
});
for (const part of [0, 7, 8, 11, 12]) test(`sustained loss of required landmark ${part} becomes bad without fabricating a score`, () => {
  const c = camera(); let result = c.frame([part]);
  for (let i = 0; i < 12; i++) result = c.frame([part]);
  expect(result.postureState).toBe('bad'); expect(result.eval.qualityOk).toBe(false);
});
test('one minute good and nine minutes untracked is 10%, with a gap in the graph and no reward', () => {
  const s = createSession('loss', { focusMinutes:10, restMinutes:0, cycles:1 }, 0, {stats:{},headWidthRatio:1} as Baseline);
  const good = { valid:true,good:true,deviation:0 };
  advanceSession(s,0,good);
  for (let t=1000;t<=600000;t+=1000) advanceSession(s,t,t<=60000?good:{valid:false,good:false,deviation:0});
  finishSession(s);
  expect(goodRatio(s)).toBeCloseTo(.1); expect(s.rewardQualified).toBe(false);
  expect(s.samples.at(-1)?.score).toBeNull(); expect(s.samples.at(-1)?.state).toBe('untracked');
});
