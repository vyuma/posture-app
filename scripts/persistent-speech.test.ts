import { expect, test } from 'bun:test';
import { FeedbackSpeech, speechMotion } from '../src/features/posture/feedbackSpeech';
import { emptyEvidence } from '../src/features/posture/feedback';
import { petEvent, replayPet } from '../src/features/timelapse/model';

test('warning remains one utterance while angry, then yields to recovery and pause', () => {
  const machine = new FeedbackSpeech();
  const step = (at: number, posture: 'good' | 'bad' = 'bad', mode: 'focus' | 'paused' = 'focus') => machine.update({context:'session', mode, now:at, observedAt:at, maxAge:1500, valid:true, posture, evidence:emptyEvidence()});
  const first = step(0)!;
  for(let at=100;at<=60000;at+=100) expect(step(at)).toBe(first);
  expect(speechMotion(first,60000,false,true).opacity).toBe(1);
  expect(speechMotion(first,60000,false,false).visible).toBe(false);
  step(60100,'good'); const good=step(60500,'good')!;
  expect(good.code).toBe('good'); expect(good.endsAt-good.startedAt).toBe(6500);
  expect(good.whileBad).toBeUndefined();
  const paused=step(60600,'good','paused')!;
  expect(paused.code).toBe('paused'); expect(paused.whileBad).toBeUndefined();
});

test('subtle rocking repeats without flashing and respects reduced motion', () => {
  const event={id:'warn',code:'general' as const,text:'姿勢を戻して！',startedAt:0,endsAt:15000,whileBad:true as const};
  const a=speechMotion(event,18130,false,true), b=speechMotion(event,19430,false,true);
  expect(a.visible).toBe(true); expect(b.visible).toBe(true);
  expect(a.opacity).toBe(1); expect(b.opacity).toBe(1);
  expect(a.angle*b.angle).toBeLessThan(0); expect(Math.abs(a.angle)).toBeLessThanOrEqual(1.2);
  expect(speechMotion(event,20730,false,true).angle).toBeCloseTo(a.angle,6);
  expect(speechMotion(event,60000,true,true)).toEqual({visible:true,opacity:1,y:0,angle:0});
  expect(speechMotion({...event,whileBad:undefined},60000,false,true).visible).toBe(false);
});

test('recorded persistence survives JSON and seeking, with a later null clearing it', () => {
  const speech={id:'warn',code:'general' as const,text:'姿勢を戻して！',startedAt:10000,endsAt:25000,whileBad:true as const};
  const widget={sessionId:'qa',phase:'focus' as const,paused:false,bad:true,badSince:10000,remainingMs:100000,durationMs:300000,cycle:1,cycles:4,feedbackVersion:1 as const,speech};
  const a=petEvent(0,widget,undefined,true,false,10000);
  const b=petEvent(40,{...widget,bad:false,speech:null},a,true,false,50000);
  const records=JSON.parse(JSON.stringify([a,b]));
  const replay=replayPet(records,30)!;
  expect(speechMotion(replay.speech!,30000,replay.reduced,replay.pose==='bad').visible).toBe(true);
  expect(replayPet(records,41)?.speech).toBeNull();
});
