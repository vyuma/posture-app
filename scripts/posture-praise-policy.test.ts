import { expect, test } from 'bun:test';
import { FeedbackSpeech, speechMotion } from '../src/features/posture/feedbackSpeech';

type Input = Parameters<FeedbackSpeech['update']>[0];
function timeline() {
  const machine = new FeedbackSpeech();
  let at = 0;
  const praise = new Set<string>();
  const step = (extra: Partial<Input> = {}) => {
    const speech = machine.update({ context: 'session:baseline', mode: 'focus', now: at, observedAt: at,
      maxAge: 1500, valid: true, posture: 'good', evidence: {faceNear:0, headForward:0, headTilt:0, bodyTilt:0}, ...extra });
    if (speech?.code === 'good') praise.add(speech.id);
    at += 100; return speech;
  };
  const run = (milliseconds: number, extra: Partial<Input> = {}) => {
    let speech; for (let i=0; i<milliseconds; i+=100) speech = step(extra); return speech;
  };
  return { step, run, praise, now: () => at };
}

test('first stable good appears once, expires, and only actual bad-to-good earns another praise', () => {
  const t=timeline(); const first=t.run(500)!;
  expect(first.code).toBe('good'); expect(speechMotion(first,500).visible).toBe(true);
  t.run(8000); expect(t.praise.size).toBe(1); expect(speechMotion(first,t.now()).visible).toBe(false);
  t.run(1500,{posture:'bad'}); const recovery=t.run(500)!;
  expect(recovery.code).toBe('good'); expect(recovery.id).not.toBe(first.id);
  t.run(8000); expect(t.praise.size).toBe(2); expect(speechMotion(recovery,t.now()).visible).toBe(false);
});

test('a specific reason clearing while overall posture stayed good is not another recovery praise', () => {
  const t=timeline(); t.run(500);
  expect(t.run(1500,{evidence:{faceNear:0,headForward:0,headTilt:2,bodyTilt:0}})?.code).toBe('headTilt');
  t.run(3000); expect(t.praise.size).toBe(1);
});

for (const mode of ['paused','rest','off'] as const) {
  test(`${mode} to focus does not replay praise or carry pre-interruption bad into recovery`, () => {
    const t=timeline();t.run(500);t.run(500,{posture:'bad'});
    t.run(1000,{mode});t.run(2000);
    expect(t.praise.size).toBe(1);
    t.run(500,{posture:'bad'});t.run(500);
    expect(t.praise.size).toBe(2);
  });
}

test('tracking loss and reason abstention cannot manufacture a new good transition',()=>{
  const t=timeline();t.run(500);t.run(3000,{valid:false});t.run(1000);t.run(1000,{reasonAvailable:false});t.run(1000);
  expect(t.praise.size).toBe(1);
});

test('recalibration resets reasons but not session praise; a genuinely new session has its own first praise',()=>{
  const t=timeline();t.run(500,{sessionId:'measurement-1'});
  t.run(500,{sessionId:'measurement-1',posture:'bad'});
  t.run(1000,{sessionId:'measurement-1',context:'session:new-baseline'});
  expect(t.praise.size).toBe(1);
  t.run(500,{sessionId:'measurement-1',context:'session:new-baseline',posture:'bad'});
  t.run(500,{sessionId:'measurement-1',context:'session:new-baseline'});
  expect(t.praise.size).toBe(2);
  t.run(500,{sessionId:'measurement-2',context:'session-2:baseline'});
  expect(t.praise.size).toBe(3);
});

test('preparation before first focus preserves the initial praise, but pausing before it does not replay it on resume',()=>{
  const t=timeline();t.run(2000,{mode:'off'});t.run(500);expect(t.praise.size).toBe(1);
  const interrupted=timeline();interrupted.run(200);interrupted.run(1000,{mode:'paused'});interrupted.run(2000);
  expect(interrupted.praise.size).toBe(0);
});

test('bad before tracking loss followed by fresh good earns one recovery, never a stale frame',()=>{
  const t=timeline();t.run(500);t.run(500,{posture:'bad'});t.run(3000,{valid:false,posture:'bad'});
  t.run(500,{posture:'good',observedAt:0});expect(t.praise.size).toBe(1);
  t.run(500);expect(t.praise.size).toBe(2);t.run(5000);expect(t.praise.size).toBe(2);
});
