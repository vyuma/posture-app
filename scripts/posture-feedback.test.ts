import { describe, test, expect } from 'bun:test';
import { FeedbackObserver, feedbackMetrics, classifyEvidence, emptyEvidence, type Evidence } from '../src/features/posture/feedback';
import { FeedbackSpeech, speechMotion } from '../src/features/posture/feedbackSpeech';
import { createPostureEngineState, evaluatePostureFrame } from '../src/features/posture/engine';
import { petEvent, replayPet } from '../src/features/timelapse/model';

function pose() {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [i, x, y] of [[0,.5,.24],[7,.43,.24],[8,.57,.24],[2,.47,.22],[5,.53,.22],[11,.35,.45],[12,.65,.45],[23,.4,.8],[24,.6,.8]]) p[i] = { x, y, z: 0, visibility: 1 };
  return p;
}
function world() {
  const p = pose().map(v => ({ ...v, x: v.x - .5, y: v.y - .8 }));
  p[0].z = -.1; p[7].z = p[8].z = -.04;
  return p;
}
function calibrated() {
  const observer = new FeedbackObserver();
  for (let t = 0; t < 5000; t += 100) observer.observe(pose(), world(), 1280,720,'camera',false,true,t);
  observer.observe(pose(),world(),1280,720,'camera',true,true,5000);
  return observer;
}
describe('dialogue observations, separate from scoring', () => {
  test('calibration, independent cues, mirrored coordinates and ambiguous uniform zoom', () => {
    const o = calibrated(), baseline = o.capture()!;
    const head = pose(); for (const i of [7,8,2,5]) head[i].x = .5 + (head[i].x - .5) * 1.3;
    const near = o.observe(head,world(),1280,720,'camera',true,true,5100).evidence;
    expect(near.faceNear).toBeGreaterThan(1);
    const zoom = pose().map(p => ({ ...p, x:.5+(p.x-.5)*1.3, y:.5+(p.y-.5)*1.3 }));
    expect(classifyEvidence(feedbackMetrics(zoom,world(),1280,720),baseline,baseline.camera).faceNear ?? 0).toBeLessThan(1);
    const tilted = pose(); for(const i of [7,8,2,5]) tilted[i].y += (tilted[i].x-.5)*1280/720*Math.tan(18*Math.PI/180);
    expect(o.observe(tilted,world(),1280,720,'camera',true,true,5200).evidence.headTilt).toBeCloseTo(1.5);
    expect(o.observe(tilted.map(p=>({...p,x:1-p.x})),null,1280,720,'camera',true,true,5300).evidence.headTilt).toBeCloseTo(1.5);
    expect(o.observe(pose(),world(),720,1280,'camera',true,true,5400).baselineReady).toBe(false);
  });
  test('missing hips allow upper-body forward evidence but never invent body tilt; turning is separate', () => {
    const o=calibrated(), noHip=pose(); noHip[23].visibility=noHip[24].visibility=0;
    const partial=o.observe(noHip,world(),1280,720,'camera',true,true,5100);
    expect(partial.available).toBe(true);
    const e=partial.evidence;
    expect(e.bodyTilt).toBeNull(); expect(e.headForward).toBe(0);
    const turn=pose(); turn[0].x=.56;
    const turning=o.observe(turn,world(),1280,720,'camera',true,true,5200).evidence;
    expect(turning.headTurn).toBeGreaterThan(1); expect(turning.headTilt).toBeNull();
    const hidden=pose();hidden[7].visibility=.2;
    const lost=o.observe(hidden,world(),1280,720,'camera',true,true,5300);
    expect(lost.evidence).toEqual(emptyEvidence());expect(lost.available).toBe(false);
  });
  test('signed forward movement does not report a backward movement',()=>{
    const o=calibrated(), forward=world(); for(const i of [0,7,8])forward[i].z-=.09;
    expect(o.observe(pose(),forward,1280,720,'camera',true,true,5100).evidence.headForward).toBeGreaterThan(1);
    const back=world();for(const i of [0,7,8])back[i].z+=.09;
    expect(o.observe(pose(),back,1280,720,'camera',true,true,5200).evidence.headForward).toBe(0);
  });
  test('old baselines remain usable without inventing reason calibration',()=>{
    const o=new FeedbackObserver();
    expect(o.observe(pose(),world(),1280,720,'camera',true,true,5000).evidence).toEqual(emptyEvidence());
    const restored=new FeedbackObserver(); restored.reset(calibrated().capture()!);
    expect(restored.observe(pose(),world(),1280,720,'camera',true,true,6000).baselineReady).toBe(true);
  });
  test('observer cannot alter any engine output, including warmup, scoring, state and recovery',()=>{
    let plain=createPostureEngineState(), observed=createPostureEngineState(); const observer=new FeedbackObserver();
    for(let t=0;t<14000;t+=100){
      const p=pose(),w=world();if(t>6000&&t<9000){p[0].x+=.04;w[0].x+=.04;} if(t>10000&&t<10500)p[11].visibility=0;
      const a=evaluatePostureFrame(plain,t,p,w),b=evaluatePostureFrame(observed,t,p,w);
      observer.observe(p,w,1280,720,'camera',b.result.baselineReady,b.result.features!==null,t);
      expect(b).toEqual(a); plain=a.state;observed=b.state;
    }
  });
});

function timeline() {
  const machine=new FeedbackSpeech(); let last=0;
  const step=(at:number,evidence:Partial<Evidence>,extra:Partial<Parameters<FeedbackSpeech['update']>[0]>={})=>{
    last=at;return machine.update({context:'session:baseline',sessionId:'measurement',mode:'focus',now:at,observedAt:at,maxAge:1500,valid:true,posture:'bad',evidence:{...emptyEvidence(),faceNear:0,headForward:0,headTilt:0,bodyTilt:0,...evidence},...extra});
  };
  const run=(until:number,evidence:Partial<Evidence>,extra:Partial<Parameters<FeedbackSpeech['update']>[0]>={})=>{let out;for(let t=last+100;t<=until;t+=100)out=step(t,evidence,extra);return out;};
  return {step,run};
}
describe('one visible reason, all reasons tracked',()=>{
  test('A resolves after a long warning: sustained B gets a new utterance without restarting its dwell',()=>{
    const t=timeline();t.step(0,{faceNear:2,headTilt:1.5}); const a=t.run(1500,{faceNear:2,headTilt:1.5})!;expect(a.code).toBe('faceNear');
    expect(a.endsAt-a.startedAt).toBe(15000);
    expect(speechMotion(a,6000).visible).toBe(true);
    expect(t.run(22000,{faceNear:2,headTilt:1.5})?.id).toBe(a.id);expect(speechMotion(a,22000,false,true).visible).toBe(true);
    const b=t.run(22500,{headTilt:1.5})!;expect(b.code).toBe('headTilt');expect(b.id).not.toBe(a.id);expect(b.startedAt).toBe(22500);
    expect(t.run(27000,{headTilt:1.5})?.id).toBe(b.id);
  });
  test('both resolve after only A was announced: never emits stale B, then praises stable good',()=>{
    const t=timeline();t.step(0,{faceNear:2,headTilt:1.5});expect(t.run(1500,{faceNear:2,headTilt:1.5})?.code).toBe('faceNear');
    const codes=[];for(let at=1600;at<=2600;at+=100)codes.push(t.step(at,{}, {posture:'good'})?.code);
    expect(codes).not.toContain('headTilt');expect(codes.at(-1)).toBe('good');
  });
  test('overall good clears every warning even when another cue remains',()=>{
    const t=timeline();t.step(0,{faceNear:2,headTilt:1.5});t.run(1500,{faceNear:2,headTilt:1.5});
    const codes=[];for(let at=1600;at<=2300;at+=100)codes.push(t.step(at,{headTilt:1.5},{posture:'good'})?.code);
    expect(codes).not.toContain('headTilt');expect(codes.at(-1)).toBe('good');
  });
  test('flicker and transient cues cannot rotate messages; no stale queue when B disappeared first',()=>{
    const t=timeline();t.step(0,{faceNear:2,headTilt:1.5});const a=t.run(1500,{faceNear:2,headTilt:1.5})!;
    expect(t.run(2500,{faceNear:2,headTilt:2.1})?.id).toBe(a.id);
    t.run(3200,{faceNear:2});expect(t.run(4100,{}, {posture:'good'})?.code).toBe('good');
  });
  test('tracking loss stays silent, hides the current claim, and recovery requires fresh evidence',()=>{
    const t=timeline();t.step(0,{faceNear:2});t.run(1500,{faceNear:2});expect(t.step(1600,{}, {valid:false})?.code).toBe('faceNear');
    expect(t.run(3500,{}, {valid:false})).toBeNull();expect(t.run(3700,{}, {valid:false})).toBeNull();
    expect(t.run(8000,{}, {valid:false})).toBeNull();expect(t.step(8100,{}, {posture:'good'})).toBeNull();
    expect(t.run(8600,{}, {posture:'good'})?.code).toBe('good');
  });
  test('repeated observations cannot create another utterance; pause and new baseline clear old candidates',()=>{
    const t=timeline();const first=t.step(0,{faceNear:2})!;expect(t.run(1400,{faceNear:2},{observedAt:0})?.id).toBe(first.id);
    expect(t.step(1500,{}, {mode:'paused'})?.code).toBe('paused');expect(t.step(1600,{faceNear:2},{observedAt:1400})).toBeNull();
    expect(t.step(1700,{}, {context:'session:new-baseline',posture:'good'})).toBeNull();
  });
});

describe('speech replay and accessibility',()=>{
  test('recorded words and timing survive anchors, seeking, cancellation and old records',()=>{
    const speech={id:'e1',code:'headTilt' as const,text:'頭が傾いてるよ！',startedAt:10000,endsAt:13680};
    const widget={sessionId:'qa',phase:'focus' as const,paused:false,bad:true,badSince:9000,remainingMs:100000,durationMs:300000,cycle:1,cycles:4,feedbackVersion:1 as const,speech};
    const a=petEvent(5,widget,undefined,true,false,11000);expect(a.speech?.startedAt).toBe(4000);
    const b=petEvent(6,widget,a,true,false,12010);expect(b.speech).toEqual(a.speech);
    expect(speechMotion(replayPet([a,b],6)!.speech!,6000).visible).toBe(true);
    expect(speechMotion(replayPet([a,b],8)!.speech!,8000).visible).toBe(false);
    const c=petEvent(6.5,{...widget,speech:null},b);expect(replayPet([a,b,c],7)?.speech).toBeNull();
    expect(petEvent(0,{...widget,feedbackVersion:undefined}).feedbackVersion).toBeUndefined();
    expect(speechMotion(a.speech!,5000,true)).toEqual({visible:true,opacity:1,y:0,angle:0});
  });
});


describe('pinpoint directions and authoritative timing', () => {
  test('front/back are signed even when hips were never in the calibration frame', () => {
    const image = pose(), baseWorld = world();
    for (const i of [23,24]) { image[i].visibility = 0; baseWorld[i].visibility = 0; }
    const o = new FeedbackObserver();
    for (let at=0;at<5000;at+=100) o.observe(image,baseWorld,1280,720,'camera',false,true,at);
    o.observe(image,baseWorld,1280,720,'camera',true,true,5000);
    for (const offset of [-.09,.09]) {
      const w = structuredClone(baseWorld); for (const i of [0,7,8]) w[i].z += offset;
      const next = o.observe(image,w,1280,720,'camera',true,true,5100);
      expect(next.evidence.bodyTilt).toBeNull();
      if (offset<0) expect(next.evidence.headForward).toBeGreaterThan(1);
      else expect(next.evidence.headForward).toBe(0);
    }
  });
  test('head, shoulder, lateral, body and turn directions use anatomical sides even when mirrored', () => {
    for (const mirror of [false,true]) {
      const map = (p: ReturnType<typeof pose>) => p.map(v=>({...v,x:mirror?1-v.x:v.x}));
      const o = new FeedbackObserver();
      for(let at=0;at<5000;at+=100)o.observe(map(pose()),null,1280,720,'camera',false,true,at);
      o.observe(map(pose()),null,1280,720,'camera',true,true,5000);
      const observe=(p:ReturnType<typeof pose>)=>o.observe(map(p),null,1280,720,'camera',true,true,5100);
      const tilt=pose();for(const i of [7,8,2,5])tilt[i].y-=(tilt[i].x-.5)*1280/720*Math.tan(18*Math.PI/180);
      expect(observe(tilt).directions?.headTilt).toBe('left');expect(observe(tilt).evidence.headTilt).toBeGreaterThan(1);
      const shoulder=pose();shoulder[11].y-=.09;
      expect(observe(shoulder).directions?.shoulderTilt).toBe('left');expect(observe(shoulder).evidence.shoulderTilt).toBeGreaterThan(1);
      expect(observe(shoulder).evidence.headShift).toBeCloseTo(0);
      const shifted=pose();for(const i of [0,7,8,2,5])shifted[i].x-=.06;
      expect(observe(shifted).directions?.headShift).toBe('left');expect(observe(shifted).evidence.headShift).toBeGreaterThan(1);
      const body=pose();for(const i of [0,7,8,2,5,11,12])body[i].x+=.08;
      expect(observe(body).directions?.bodyTilt).toBe('right');expect(observe(body).evidence.bodyTilt).toBeGreaterThan(1);
      const turned=pose();turned[0].x+=.06;
      expect(observe(turned).directions?.headTurn).toBe('right');expect(observe(turned).evidence.headTurn).toBeGreaterThan(1);
      expect(observe(turned).evidence.headTilt).toBeNull();
    }
  });
  test('chin up/down needs 3D evidence; old baselines cannot invent the new cues', () => {
    const o=calibrated();
    for(const delta of [-.03,.03]) {
      const w=world();w[0].y+=delta;
      const v=o.observe(pose(),w,1280,720,'camera',true,true,5100);
      expect(v.evidence.headPitch).toBeGreaterThan(1);expect(v.directions?.headPitch).toBe(delta>0?'down':'up');
    }
    expect(o.observe(pose(),null,1280,720,'camera',true,true,5200).evidence.headPitch).toBeNull();
    const legacy=o.capture()!;legacy.version=1;
    for(const k of ['forwardAligned','forwardUpper','headSide','bodySide','shift','pitch','shoulderSide','turn'] as const)delete legacy.values[k];
    o.reset(legacy);
    const v=o.observe(pose(),world(),1280,720,'camera',true,true,5300);
    expect(v.evidence.headShift).toBeNull();expect(v.directions).toEqual({});expect(v.evidence.headTilt).toBe(0);
  });
  test('first bad frame announces immediately; even a much stronger challenger waits until the selected issue resolves', () => {
    const t=timeline();
    for(let at=0;at<1200;at+=100)expect(t.step(at,{headTilt:2},{posture:'good'})?.code).not.toBe('headTilt');
    const first=t.step(1200,{headTilt:2},{directions:{headTilt:'right'}})!;
    expect(first.text).toBe('頭が右に傾いてるよ！');expect(first.startedAt).toBe(1200);
    for(let at=1300;at<3500;at+=100)expect(t.step(at,{headTilt:2,faceNear:10},{directions:{headTilt:'right'}})?.id).toBe(first.id);
    expect(t.step(3500,{headTilt:0,faceNear:10})?.text).toBe(first.text);
    expect(t.run(3900,{headTilt:0,faceNear:10})?.code).toBe('faceNear');
  });
});


test('a rigid upper-body pitch or chin raise alone never claims forward-head movement without hips',()=>{
  const image=pose(), w=world(), o=new FeedbackObserver();
  for(const i of [23,24]){image[i].visibility=0;w[i].visibility=0;}
  for(let t=0;t<5000;t+=100)o.observe(image,w,1280,720,'camera',false,true,t);
  o.observe(image,w,1280,720,'camera',true,true,5000);
  const sy=(w[11].y+w[12].y)/2;
  for(const deg of [10,20,30]){
    const angle=deg*Math.PI/180;
    const rotated=w.map(p=>({...p,y:sy+(p.y-sy)*Math.cos(angle)-p.z*Math.sin(angle),z:(p.y-sy)*Math.sin(angle)+p.z*Math.cos(angle)}));
    const result=o.observe(image,rotated,1280,720,'camera',true,true,5100);
    expect(result.evidence.headForward).not.toBeNull();expect(result.evidence.headForward!).toBeLessThan(1);
  }
  const chinUp=world();chinUp[0].y-=.05;
  expect(o.observe(image,chinUp,1280,720,'camera',true,true,5200).evidence.headForward).toBe(0);
});

test('fresh bad after a tracking gap or good-without-reasons chooses the strongest current issue',()=>{
  for(const unavailable of ['gap','good'] as const){
    const t=timeline();expect(t.step(0,{faceNear:2,shoulderTilt:1.5})?.code).toBe('faceNear');
    t.run(2200,{},unavailable==='gap'?{valid:false}:{posture:'good',reasonAvailable:false});
    expect(t.step(2300,{faceNear:2,shoulderTilt:10})?.code).toBe('shoulderTilt');
  }
  const t=timeline();t.step(0,{faceNear:2,shoulderTilt:1.5});
  expect(t.step(2500,{faceNear:2,shoulderTilt:10})?.code).toBe('shoulderTilt');
});


test('a cleared warning cannot masquerade as initial praise after a camera epoch change',()=>{
  const t=timeline();t.step(0,{}, {posture:'good'});
  expect(t.step(400,{}, {posture:'good'})?.code).toBe('good');
  expect(t.step(500,{faceNear:2})?.code).toBe('faceNear');
  expect(t.step(1200,{}, {valid:false})).toBeNull();
  expect(t.step(1300,{}, {context:'new-camera',posture:'good'})).toBeNull();
  expect(t.step(1700,{}, {context:'new-camera',posture:'good'})).toBeNull();
});
