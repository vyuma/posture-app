import { expect, test } from 'bun:test';
import { createPostureEngineState } from '../src/features/posture/engine';
import { evaluatePostureObservation } from '../src/features/posture/observation';
import { FeedbackObserver } from '../src/features/posture/feedback';
import { DEFAULT_JUDGMENT, normalizeJudgment, relativeHeadYaw, type JudgmentSettings } from '../src/features/posture/judgment';
import { resolveCandidateBadState } from '../src/features/posture/engine.score';
import { createSession, endCalibration, normalizeTimer, DEFAULT_TIMER, type Baseline } from '../src/features/work/model';

function pose(yaw=0, shift=0, forward=0, tilt=0) {
  const image=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  for(const [i,x,y] of [[0,.5,.24],[7,.43,.24],[8,.57,.24],[2,.47,.22],[5,.53,.22],[11,.35,.45],[12,.65,.45],[23,.4,.8],[24,.6,.8]]) image[i]={x,y,z:0,visibility:1};
  const world=image.map(p=>({...p,x:p.x-.5,y:p.y-.8}));
  world[0].z=-.1;world[7].z=world[8].z=-.04;
  const a=yaw*Math.PI/180;
  for(let i=0;i<=10;i++) { const p=world[i],x=p.x,z=p.z+.04;p.x=x*Math.cos(a)-z*Math.sin(a)+shift;p.z=x*Math.sin(a)+z*Math.cos(a)-.04-forward;image[i].x=p.x+.5; }
  for(const i of [7,8,2,5]) image[i].y += (image[i].x-.5)*1280/720*Math.tan(tilt*Math.PI/180);
  return {image,world};
}
function run(settings: JudgmentSettings, yaw=0, shift=0, forward=0, noWorld=false, tilt=0) {
  let state=createPostureEngineState();const observer=new FeedbackObserver();let result: ReturnType<typeof evaluatePostureObservation>;
  for(let now=0;now<=8000;now+=100){const p=pose(now>5000?yaw:0,now>5000?shift:0,now>5000?forward:0,now>5000?tilt:0);result=evaluatePostureObservation(state,observer,now,p.image,noWorld&&now>5000?null:p.world,{width:1280,height:720,id:'camera'},settings);state=result.state;}
  return result!;
}
test('normal retains the existing entry, recovery and low-confidence thresholds',()=>{
  expect(resolveCandidateBadState(false,1.59,1,1)).toBe(false);expect(resolveCandidateBadState(false,1.6,1,1)).toBe(true);
  expect(resolveCandidateBadState(true,1.19,1,1)).toBe(false);expect(resolveCandidateBadState(true,1.2,1,1)).toBe(true);
  expect(resolveCandidateBadState(false,1.7,.2,1)).toBe(false);
  expect(resolveCandidateBadState(false,1.6,1,1.6)).toBe(false);expect(resolveCandidateBadState(false,2.57,1,1.6)).toBe(true);
  expect(resolveCandidateBadState(false,1.04,1,.65)).toBe(true);
});
test('dual monitor permits both directions through 60 degrees, but not beyond it at any difficulty',()=>{
  for(const difficulty of ['easy','normal','hard'] as const){
    for(const yaw of [-60,-45,0,45,60]){const r=run({difficulty,dualMonitor:true},yaw);expect(r.result.eval.qualityOk).toBe(true);expect(r.result.postureState).toBe('good');expect(r.feedback.evidence.headTurn).toBe(0);}
    for(const yaw of [-65,65]){const r=run({difficulty,dualMonitor:true},yaw);expect(r.result.postureState).toBe('bad');expect(r.feedback.evidence.headTurn).toBeGreaterThan(1);}
  }
});
test('allowed yaw does not exempt real head drift or forward movement, or invent tracking',()=>{
  expect(run({...DEFAULT_JUDGMENT,dualMonitor:true},45,.15).result.postureState).toBe('bad');
  expect(run({...DEFAULT_JUDGMENT,dualMonitor:true},45,0,.14).result.eval.score).toBeGreaterThan(run({...DEFAULT_JUDGMENT,dualMonitor:true},45).result.eval.score+.5);
  const missing=run({...DEFAULT_JUDGMENT,dualMonitor:true},45,0,0,true);
  expect(missing.result.eval.qualityOk).toBe(false);expect(missing.result.postureState).toBe('hold');
  expect(relativeHeadYaw(0,0,0,-1)).toBeNull();expect(relativeHeadYaw(NaN,1,0,-1)).toBeNull();
});
test('settings migrate safely and the immutable calibration version records the chosen rule',()=>{
  expect(normalizeJudgment({difficulty:'invalid',dualMonitor:'yes'} as never)).toEqual(DEFAULT_JUDGMENT);
  expect(normalizeTimer(DEFAULT_TIMER)).toEqual(DEFAULT_TIMER);
  const settings={...DEFAULT_TIMER,posture:{difficulty:'hard' as const,dualMonitor:true}};
  expect(normalizeTimer(settings)).toEqual(settings);
  const s=createSession('test',settings,0,{stats:{},headWidthRatio:null} as Baseline);
  expect(s.calibrations[0].scoreVersion).toContain('hard-dual60');
  endCalibration(s,{stats:{},headWidthRatio:null} as Baseline);
  expect(s.calibrations[1].scoreVersion).toBe(s.calibrations[0].scoreVersion);
});

test('difficulty changes the observed head-tilt decision without changing the normal default',()=>{
  expect(run({difficulty:'easy',dualMonitor:false},0,0,0,false,14).result.postureState).toBe('good');
  expect(run(DEFAULT_JUDGMENT,0,0,0,false,14).result.postureState).toBe('bad');
  expect(run(DEFAULT_JUDGMENT,0,0,0,false,8).result.postureState).toBe('good');
  expect(run({difficulty:'hard',dualMonitor:false},0,0,0,false,8).result.postureState).toBe('bad');
  let implicit=createPostureEngineState(), explicit=createPostureEngineState();
  const a=new FeedbackObserver(),b=new FeedbackObserver();
  for(let now=0;now<10000;now+=100){
    const p=pose(now>6000?35:0,now>8000?.1:0);
    const x=evaluatePostureObservation(implicit,a,now,p.image,p.world,{width:1280,height:720,id:'camera'});
    const y=evaluatePostureObservation(explicit,b,now,p.image,p.world,{width:1280,height:720,id:'camera'},DEFAULT_JUDGMENT);
    expect(x).toEqual(y);implicit=x.state;explicit=y.state;
  }
});
