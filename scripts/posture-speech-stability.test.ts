import { expect, test } from 'bun:test';
import { FeedbackSpeech } from '../src/features/posture/feedbackSpeech';

function goodRun(disturbance: 'none' | 'missing' | 'candidate' | 'hold') {
  const machine = new FeedbackSpeech(), ids = new Set<string>();
  for (let at = 0; at <= 8000; at += 100) {
    const interrupt = at >= 800 && at % 800 === 0;
    const event = machine.update({ context: 'same-session', mode: 'focus', now: at, observedAt: at, maxAge: 1500,
      valid: !(interrupt && disturbance === 'missing'), posture: interrupt && disturbance === 'hold' ? 'hold' : 'good',
      evidence: { faceNear: 0, headForward: 0, headTilt: interrupt && disturbance === 'candidate' ? 1.1 : 0, bodyTilt: 0 } });
    if (event?.code === 'good') ids.add(event.id);
  }
  return [...ids];
}

test('stable good posture has one praise event', () => expect(goodRun('none')).toHaveLength(1));
test('brief missing frames do not retrigger praise while posture remains good', () => expect(goodRun('missing')).toHaveLength(1));
test('unconfirmed reason spikes do not retrigger praise', () => expect(goodRun('candidate')).toHaveLength(1));
test('brief hold readings do not retrigger praise', () => expect(goodRun('hold')).toHaveLength(1));


import { postureSpeechSample } from '../src/features/work/usePostureSpeech';
import { emptyEvidence } from '../src/features/posture/feedback';
import { petEvent, replayPet } from '../src/features/timelapse/model';
function sample(at: number, posture: 'bad' | 'good', qualityOk = true, available = false) {
  return postureSpeechSample({ observedAtMs: at, trackingIntervalMs: 100, qualityOk, baselineReady: true,
    postureState: posture, feedback: { epoch: 1, baselineReady: true, available, evidence: emptyEvidence() } }, 0);
}
test('valid bad scoring with unavailable reason says general once; genuine tracking loss stays silent', () => {
  const machine = new FeedbackSpeech();
  const update = (at: number, quality = true) => machine.update({ context: 'session', mode: 'focus', now: at, ...sample(at, 'bad', quality) });
  const first = update(0)!;
  expect(first.text).toBe('姿勢を戻して！');
  for (let at = 100; at <= 4000; at += 100) expect(update(at)?.id).toBe(first.id);
  for (let at = 4100; at <= 4500; at += 100) expect(update(at, false)?.id).toBe(first.id);
  for (let at = 4600; at <= 7000; at += 100) expect(update(at, false)).toBeNull();
  expect(update(7100)?.code).toBe('general'); // Fresh bad posture restores a persistent warning after uncertainty.
});
test('reason abstention never invents praise; a real bad/good transition still announces recovery', () => {
  const machine = new FeedbackSpeech();
  const update = (at: number, posture: 'bad' | 'good', available = true) => machine.update({ context: 'session', mode: 'focus', now: at, ...sample(at, posture, true, available) });
  for (let at = 0; at <= 2000; at += 100) expect(update(at, 'good', false)).toBeNull();
  let praise; for (let at = 2100; at <= 2600; at += 100) praise = update(at, 'good');
  expect(praise?.code).toBe('good');
  expect(update(2700, 'bad')?.code).toBe('general');
  let recovery; for (let at = 2800; at <= 3300; at += 100) recovery = update(at, 'good');
  expect(recovery?.code).toBe('good'); expect(recovery?.id).not.toBe(praise?.id);
});
test('a new session can praise again, but duplicate and stale observations cannot', () => {
  const machine = new FeedbackSpeech();
  const update = (at: number, observedAt = at, context = 'one') => machine.update({ context, mode: 'focus', now: at, ...sample(observedAt, 'good', true, true) });
  update(0); const first = update(400)!; expect(first.code).toBe('good');
  expect(update(800, 400)?.id).toBe(first.id);
  expect(update(2400, 400)).toBeNull();
  update(2500); expect(update(2900)).toBeNull();
  expect(update(3000, 3000, 'two')).toBeNull();
  expect(update(3400, 3400, 'two')?.code).toBe('good');
});
test('previously recorded unavailable speech remains readable without rewriting the recording', () => {
  const old = { id: 'old', code: 'unavailable' as const, text: '姿勢を確認できないよ', startedAt: 1000, endsAt: 4680 };
  const widget = { sessionId: 'old', phase: 'focus' as const, paused: false, bad: false, badSince: null,
    remainingMs: 100000, durationMs: 300000, cycle: 1, cycles: 4, feedbackVersion: 1 as const, speech: old };
  const recorded = petEvent(0, widget, undefined, true, false, 1000);
  expect(replayPet([recorded], 1)?.speech?.text).toBe(old.text);
});

test('a brief invalid sample cannot erase a still-visible warning permanently', () => {
  const m = new FeedbackSpeech();
  const step = (at: number, valid = true) => m.update({ context: 'brief-gap', mode: 'focus', now: at, observedAt: at, maxAge: 1500, valid, posture: 'bad', reasonAvailable: false, evidence: emptyEvidence() });
  const first = step(0)!;
  expect(step(100, false)?.id).toBe(first.id);
  expect(step(200)?.id).toBe(first.id);
  expect(step(200)?.endsAt).toBe(first.endsAt);
});

test('initial camera epoch update cannot consume the first praise before it appears', () => {
  const m = new FeedbackSpeech();
  const step = (at: number, context: string) => m.update({ context, sessionId: 'new-measurement', mode: 'focus', now: at, observedAt: at, maxAge: 1500, valid: true, posture: 'good', evidence: emptyEvidence() });
  step(0, 'camera-pending'); step(100, 'camera-ready');
  expect(step(500, 'camera-ready')?.code).toBe('good');
});
