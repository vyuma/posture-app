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
  test('missing hips never invents body tilt or head-forward evidence; yaw/occlusion abstain', () => {
    const o=calibrated(), noHip=pose(); noHip[23].visibility=noHip[24].visibility=0;
    const partial=o.observe(noHip,world(),1280,720,'camera',true,true,5100);
    expect(partial.available).toBe(true);
    const e=partial.evidence;
    expect(e.bodyTilt).toBeNull(); expect(e.headForward).toBeNull();
    const turn=pose(); turn[0].x=.56;
    expect(o.observe(turn,world(),1280,720,'camera',true,true,5200).evidence).toEqual(emptyEvidence());
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
    last=at;return machine.update({context:'session:baseline',mode:'focus',now:at,observedAt:at,maxAge:1500,valid:true,posture:'bad',evidence:{faceNear:0,headForward:0,headTilt:0,bodyTilt:0,...evidence},...extra});
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
  test('remaining B still speaks if overall score becomes good; no intermediate praise',()=>{
    const t=timeline();t.step(0,{faceNear:2,headTilt:1.5});t.run(1500,{faceNear:2,headTilt:1.5});
    const codes=[];for(let at=1600;at<=2300;at+=100)codes.push(t.step(at,{headTilt:1.5},{posture:'good'})?.code);
    expect(codes).not.toContain('good');expect(codes.at(-1)).toBe('headTilt');
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
  test('repeated stale observations cannot complete dwell; pause and new baseline clear old candidates',()=>{
    const t=timeline();t.step(0,{faceNear:2});expect(t.run(1400,{faceNear:2},{observedAt:0})?.code).not.toBe('faceNear');
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
