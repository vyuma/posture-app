import { expect, test } from 'bun:test';
import { createPostureEngineState } from '../src/features/posture/engine';
import { FeedbackObserver } from '../src/features/posture/feedback';
import { FeedbackSpeech } from '../src/features/posture/feedbackSpeech';
import { evaluatePostureObservation } from '../src/features/posture/observation';
import { postureSpeechSample } from '../src/features/work/usePostureSpeech';
import { computeScore, resolveCandidateBadState } from '../src/features/posture/engine.score';
import { explainPostureDecision } from '../src/features/posture/scoreFeedback';
import { emptyEvidence, type Reason } from '../src/features/posture/feedback';
import { FEATURE_KEYS } from '../src/features/posture/engine.spec';
import { pickLandmarkSetFromSource } from '../src/features/posture/engine.pose.landmarks';
import { computeHeadForwardAngle3D, computeSignedHeadShoulderAngle3D } from '../src/features/posture/engine.pose.metrics';
import { midpoint } from '../src/features/posture/engine.pose.geometry';
import type { FeatureKey } from '../src/features/posture/engine.types';
import { measurementReading } from '../src/features/work/postureReading';
import { advanceSession, createSession } from '../src/features/work/model';
import { postureComment, summarizeFeedback } from '../src/features/work/postureComment';

function calibrated() {
  let state=createPostureEngineState(); const observer=new FeedbackObserver();
  let out: ReturnType<typeof evaluatePostureObservation>;
  const p=pose();
  for(let now=0;now<=6000;now+=100) { out=evaluatePostureObservation(state,observer,now,p.image,p.world,{width:1280,height:720,id:'camera'});state=out.state; }
  return out!;
}

function pose(depth = 0, rise = 0, mirror = false) {
  const image = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [i,x,y] of [[0,.5,.24],[7,.43,.24],[8,.57,.24],[2,.47,.22],[5,.53,.22],[11,.35,.45],[12,.65,.45]]) image[i] = { x,y,z:0,visibility:1 };
  image[23].visibility = image[24].visibility = 0;
  const world = image.map(p => ({ ...p, x:p.x-.5, y:p.y-.8 }));
  world[0].z = -.06;
  for (let i=0;i<=10;i++) { world[i].z -= depth; world[i].y -= rise; image[i].y -= rise; }
  if (mirror) { for(const p of image) p.x=1-p.x; for(const p of world) p.x=-p.x; }
  return { image, world };
}

test('signed YZ angle preserves the score magnitude, handles face direction, and abstains without depth evidence', () => {
  for(const depth of [-.08,0,.08]) for(const facing of [-1,1]) {
    const p=pose(depth), world=p.world;
    world[0].z=(world[7].z+world[8].z)/2+facing*.06;
    const selected=pickLandmarkSetFromSource(null,world,'world');
    const ears=midpoint(selected.EL!.point,selected.ER!.point), shoulders=midpoint(selected.SL!.point,selected.SR!.point);
    const angle=computeSignedHeadShoulderAngle3D(selected,selected.N!.point,ears,shoulders)!;
    expect(Math.abs(angle)).toBeCloseTo(computeHeadForwardAngle3D(selected,ears,shoulders)!);
    expect(Math.sign(angle) || 0).toBe(depth===0?0:Math.sign(-depth*facing));
    expect(computeSignedHeadShoulderAngle3D(selected,{...selected.N!.point,x:ears.x+.06,z:ears.z},ears,shoulders)).toBeNull();
    selected.EL=null;
    expect(computeSignedHeadShoulderAngle3D(selected,world[0],ears,shoulders)).toBeNull();
  }
});

test('every scored feature explains a real score contribution even when the stricter dialogue observer abstains', () => {
  const expected: Record<FeatureKey,string>={headLateralOffsetRatio:'headShift',earShoulderDistanceRatio:'headShoulderDistance',torsoTiltDeg:'bodyTilt',neckAngleDeg:'neckAngle',earShoulderAsymmetryRatio:'earShoulderBalance',headForwardAngleDeg:'headShoulderAngle'};
  for(const key of FEATURE_KEYS) {
    const base=calibrated(), features={...base.result.features!};
    features[key]=base.state.baseline![key].median+base.state.baseline![key].scale*4;
    const reliability=Object.fromEntries(FEATURE_KEYS.map(k=>[k,k===key?1:.05])) as Record<FeatureKey,number>;
    const score=computeScore(features,'front',base.state.baseline!,null,1,1,false,reliability);
    expect(resolveCandidateBadState(false,score.scoreEma,score.confidence)).toBe(true);
    expect(Object.values(score.breakdown).reduce((sum,c)=>sum+c.contribution,0)).toBeCloseTo(score.scoreEma);
    const image=pose().image; image[23].visibility=image[24].visibility=1;
    const feedback=explainPostureDecision({...base.feedback,available:false,evidence:emptyEvidence()},
      {...base.result,features,eval:{...base.result.eval,scoreBreakdown:score.breakdown}}, {...base.state,candidateBadState:true},image,1);
    expect(feedback.causes?.[0]).toBe(expected[key]);
    expect(feedback.available).toBe(true);
    const speech=new FeedbackSpeech().update({context:key,mode:'focus',now:0,observedAt:0,maxAge:1500,valid:true,reasonAvailable:feedback.available,posture:'bad',evidence:feedback.evidence,causes:feedback.causes,directions:feedback.directions});
    expect(speech?.code).toBe(expected[key]);
    expect(speech?.code).not.toBe('general');
  }
});

test('unrelated cues, expired raw causes, missing hips and hidden directions do not fabricate pinpoint claims', () => {
  const base=calibrated(), state={...base.state,candidateBadState:true};
  const cue={...base.feedback,evidence:{...emptyEvidence(),faceNear:100,headPitch:0}};
  const frame={...base.result,eval:{...base.result.eval,scoreBreakdown:{neckAngleDeg:{deviation:3,contribution:2}}}};
  const explained=explainPostureDecision(cue,frame,state,pose().image,1);
  expect(explained.causes).toEqual(['neckAngle']);
  const speech=new FeedbackSpeech();
  const input={context:'same',mode:'focus' as const,now:0,observedAt:0,maxAge:1500,valid:true,posture:'bad' as const};
  expect(speech.update({...input,...explained})?.code).toBe('neckAngle');
  const recovered=explainPostureDecision(cue,{...frame,eval:{...frame.eval,scoreBreakdown:{headWidth:{deviation:.1,contribution:.1}}}},state,pose().image,1);
  expect(recovered.causes).toEqual([]);
  expect(speech.update({...input,now:100,observedAt:100,...recovered})?.code).toBe('general');
  expect(explainPostureDecision(cue,{...frame,eval:{...frame.eval,scoreBreakdown:{torsoTiltDeg:{deviation:3,contribution:2}}}},state,pose().image,1).causes).toEqual([]);
  const neutral=explainPostureDecision(cue,{...frame,experiment:{...frame.experiment,headShoulderSignedDeg:null},eval:{...frame.eval,scoreBreakdown:{headForwardAngleDeg:{deviation:3,contribution:2}}}},state,pose().image,1);
  expect(new FeedbackSpeech().update({...input,...neutral})?.text).toBe('頭と肩の位置を戻そう！');
});

test('causal priority retains only a still-contributing reason and switches its front/back wording immediately', () => {
  const machine=new FeedbackSpeech(), evidence={...emptyEvidence(),headShoulderAngle:2,neckAngle:3,faceNear:100};
  const input={context:'session',mode:'focus' as const,maxAge:1500,valid:true,posture:'bad' as const,evidence};
  expect(machine.update({...input,now:0,observedAt:0,causes:['headShoulderAngle','neckAngle'],directions:{headShoulderAngle:'backward'}})?.text).toBe('頭が後ろに傾いてるよ！');
  expect(machine.update({...input,now:100,observedAt:100,causes:['neckAngle','headShoulderAngle'],directions:{headShoulderAngle:'forward'}})?.text).toBe('頭が前に出てるよ！');
  expect(machine.update({...input,now:200,observedAt:200,causes:['neckAngle']})?.code).toBe('neckAngle');
  expect(machine.update({...input,now:300,observedAt:300,causes:['neckAngle'],posture:'good'})?.code).not.toBe('neckAngle');
});

test('result comments preserve backward causes and never count unrelated cues or mix old/new feedback versions', () => {
  const base=calibrated(), s=createSession('causal',{focusMinutes:1,restMinutes:0,cycles:1},0,{stats:base.state.baseline!,headWidthRatio:1},0);
  for(let now=0;now<=20000;now+=1000) {
    const reading=measurementReading({observedAtMs:now,trackingIntervalMs:100,baselineReady:true,qualityOk:true,postureState:'bad',score:2,
      feedback:{epoch:1,baselineReady:true,available:true,causes:['headShoulderAngle'],directions:{headShoulderAngle:'backward'},evidence:{...emptyEvidence(),headShoulderAngle:2,faceNear:100}}},now);
    advanceSession(s,now,reading);
  }
  expect(s.samples[0].feedback?.version).toBe(3);
  expect(summarizeFeedback(s).reasons.faceNear.activeMs).toBe(0);
  expect(postureComment(s)?.[0]).toBe('今日は頭が後ろに傾きがちだったね。');
  s.samples[10].feedback!.version=2;
  expect(summarizeFeedback(s).reasons.headShoulderAngle.activeMs).toBe(18000);
});

test('head-tilt hysteresis keeps the current direction and records the actual BAD cause', () => {
  let state=createPostureEngineState(); const observer=new FeedbackObserver(), speech=new FeedbackSpeech();
  const base=calibrated(), session=createSession('tilt',{focusMinutes:1,restMinutes:0,cycles:1},0,{stats:base.state.baseline!,headWidthRatio:1},6000);
  let result: ReturnType<typeof evaluatePostureObservation>;
  let said: ReturnType<FeedbackSpeech['update']>;
  for(let now=0;now<=25000;now+=100) {
    const p=pose(), roll=now<=6000?0:now<=8000?14:-9;
    for(const i of [2,5,7,8]) p.image[i].y+=(p.image[i].x-.5)*1280/720*Math.tan(roll*Math.PI/180);
    result=evaluatePostureObservation(state,observer,now,p.image,p.world,{width:1280,height:720,id:'camera'});
    state=result.state;
    const snapshot={...result.result,feedback:result.feedback,qualityOk:result.result.eval.qualityOk,observedAtMs:now,trackingIntervalMs:100};
    said=speech.update({context:'tilt',mode:'focus',now,...postureSpeechSample(snapshot,0)});
    if(now>=6000) advanceSession(session,now,measurementReading(snapshot,now));
  }
  expect(result!.result.postureState).toBe('bad');
  expect(result!.feedback.causes).toEqual(['headTilt']);
  expect(result!.feedback.directions.headTilt).toBe('left');
  expect(said!.text).toBe('頭が左に傾いてるよ！');
  expect(summarizeFeedback(session).reasons.headTilt.activeMs).toBeGreaterThan(16000);
  expect(postureComment(session)?.[0]).toContain('左');
});

for (const depth of [-.03,.03]) for (const mirror of [false,true]) {
  test(`score-driven ear/shoulder angle explains ${depth>0?'forward':'backward'}, no hips, mirror=${mirror}`, () => {
    let state=createPostureEngineState(); const observer=new FeedbackObserver(), speech=new FeedbackSpeech();
    let result: ReturnType<typeof evaluatePostureObservation> | undefined, said: ReturnType<FeedbackSpeech['update']>;
    for(let now=0;now<=9000;now+=100) {
      const p=pose(now>6000?depth:0,now>6000?.04:0,mirror);
      result=evaluatePostureObservation(state,observer,now,p.image,p.world,{width:1280,height:720,id:'camera'},{difficulty:'hard',dualMonitor:false});
      state=result.state;
      said=speech.update({context:'test',mode:'focus',now,...postureSpeechSample({...result.result,feedback:result.feedback,qualityOk:result.result.eval.qualityOk,observedAtMs:now,trackingIntervalMs:100},0)});
      if (result.result.postureState === 'bad') expect(said!.text).toBe(depth>0?'頭が前に出てるよ！':'頭が後ろに傾いてるよ！');
    }
    expect(result!.result.postureState).toBe('bad');
    expect(said!.text).toBe(depth>0?'頭が前に出てるよ！':'頭が後ろに傾いてるよ！');
  });
}

function forwardWarningSession() {
  const base=calibrated(), session=createSession('summary',{focusMinutes:1,restMinutes:0,cycles:1},0,{stats:base.state.baseline!,headWidthRatio:1},0);
  const speech=new FeedbackSpeech();
  let forwardWarnings=0;
  for(let now=0;now<=30000;now+=1000) {
    const bad=now<6000 || now>=12000;
    const causes: Reason[]=bad ? now<6000 ? ['headShoulderDistance'] : ['headShoulderAngle','headShoulderDistance'] : [];
    const snapshot={observedAtMs:now,trackingIntervalMs:100,baselineReady:true,qualityOk:true,postureState:bad?'bad' as const:'good' as const,score:bad?2:.8,
      feedback:{epoch:1,baselineReady:true,available:true,causes,directions:{headShoulderAngle:'forward' as const},evidence:{...emptyEvidence(),headShoulderAngle:now>=12000?2:null,headShoulderDistance:2}}};
    const said=speech.update({context:'summary',mode:'focus',now,...postureSpeechSample(snapshot,0)});
    if(said?.text==='頭が前に出てるよ！')forwardWarnings++;
    advanceSession(session,now,measurementReading(snapshot,now,said?.code ?? null));
  }
  expect(forwardWarnings).toBe(19);
  return session;
}
test('the result preserves the main forward warning instead of its longer secondary distance cue',()=>{
  expect(postureComment(forwardWarningSession())?.[0]).toBe('今日は頭が前に出がちだったね。');
});
test('a GOOD score with a persistent head/shoulder deviation does not establish baseline recovery',()=>{
  expect(postureComment(forwardWarningSession())?.[1]).not.toBe('でも、登録した姿勢に戻せていたよ！');
});

for (const remainingDepth of [0, .015]) test(`forward recovery requires the observed offset to return, remaining depth=${remainingDepth}`,()=>{
  let state=createPostureEngineState();
  const observer=new FeedbackObserver(), speech=new FeedbackSpeech(), base=calibrated();
  const s=createSession('recovery',{focusMinutes:1,restMinutes:0,cycles:1},0,{stats:base.state.baseline!,headWidthRatio:1},6000);
  let out: ReturnType<typeof evaluatePostureObservation>;
  for(let now=0;now<=26000;now+=100) {
    const p=now<=6000 ? pose() : now<16000 ? pose(.03,.04) : pose(remainingDepth);
    out=evaluatePostureObservation(state,observer,now,p.image,p.world,{width:1280,height:720,id:'camera'},{difficulty:'hard',dualMonitor:false});state=out.state;
    const snapshot={...out.result,feedback:out.feedback,qualityOk:out.result.eval.qualityOk,score:out.result.eval.score,observedAtMs:now,trackingIntervalMs:100};
    const said=speech.update({context:'recovery',mode:'focus',now,...postureSpeechSample(snapshot,0)});
    if(now>=6000)advanceSession(s,now,measurementReading(snapshot,now,said?.code ?? null));
  }
  expect(out!.result.postureState).toBe('good');
  expect(summarizeFeedback(s).reasons.headShoulderAngle.activeMs).toBeGreaterThan(3000);
  expect(postureComment(s)?.[0]).toBe('今日は頭が前に出がちだったね。');
  expect(postureComment(s)?.[1]==='でも、登録した姿勢に戻せていたよ！').toBe(remainingDepth===0);
});

test('unknown recovery evidence and old censored records cannot create recovery praise',()=>{
  const s=forwardWarningSession();
  for(const p of s.samples) delete p.feedback!.recoveryEvidence;
  expect(summarizeFeedback(s).recovered).toBe(false);
  for(const p of s.samples) p.feedback!.recoveryEvidence=emptyEvidence();
  expect(summarizeFeedback(s).recovered).toBe(false);
});

test('recovery of another cause cannot praise the selected forward-head pattern',()=>{
  const s=forwardWarningSession();
  for(const p of s.samples) if(p.state==='good')p.feedback!.recoveryEvidence!.headShoulderDistance=0;
  expect(summarizeFeedback(s).reasons.headShoulderDistance.recovered).toBe(true);
  expect(postureComment(s)?.[1]).not.toBe('でも、登録した姿勢に戻せていたよ！');
});
