import { expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { emptyEvidence } from '../src/features/posture/feedback';
import { measurementReading } from '../src/features/work/postureReading';
import { advanceSession, createSession, finishSession, pauseSession, resumeSession, type Baseline, type Sample } from '../src/features/work/model';
import { postureComment, summarizeFeedback } from '../src/features/work/postureComment';
import { openBrowserDriver, WorkRepository } from '../src/features/work/repository';
import { measurementUpload } from '../src/features/accounts/telemetry';
import { CONSENT_VERSION } from '../src/features/accounts/types';

function session() {
  const s=createSession('feedback-session',{focusMinutes:1,restMinutes:0,cycles:1},0,{stats:{},headWidthRatio:1} as Baseline);
  for(let second=0;second<=30;second++) {
    const bad=second<20;
    const reading=measurementReading({observedAtMs:second*1000,trackingIntervalMs:100,baselineReady:true,qualityOk:true,postureState:bad?'bad':'good',score:bad?2:.2,
      feedback:{epoch:1,baselineReady:true,available:true,directions:{headTilt:'right'},evidence:{...emptyEvidence(),headTilt:bad?2:0,headForward:bad?1.5:0}}},second*1000);
    advanceSession(s,second*1000,reading);
  }
  return s;
}
test('records all causes without recording a movie and reports one grounded pattern plus recovery',()=>{
  const s=session(), stats=summarizeFeedback(s);
  expect(stats.observedMs).toBe(30000);expect(stats.reasons.headTilt.activeMs).toBe(19000);
  expect(stats.reasons.headForward.activeMs).toBe(19000);expect(stats.reasons.headTilt.directions.right).toBe(19000);
  expect(stats.recovered).toBe(true);
  expect(postureComment(s)).toEqual(['頭が前に出る場面があったね。','登録した姿勢に戻せた場面もあったよ。']);
  for(const sample of s.samples) sample.feedback!.evidence.headForward=0;
  expect(postureComment(s)?.[0]).toBe('頭が右に傾く場面があったね。');
});
test('irregular intervals use elapsed duration; duplicated/stale samples and unavailable causes add nothing',()=>{
  const s=session();s.samples=s.samples.slice(0,3);
  s.samples[1].focusMs=s.samples[1].elapsedMs=s.samples[1].feedback!.observedAtMs=800;
  s.samples[2].focusMs=s.samples[2].elapsedMs=s.samples[2].feedback!.observedAtMs=1900;
  expect(summarizeFeedback(s).reasons.headTilt.activeMs).toBe(1900);
  s.samples[2].feedback!.observedAtMs=800;
  expect(summarizeFeedback(s).reasons.headTilt.activeMs).toBe(800);
  s.samples[1].feedback!.evidence.headTilt=null;
  expect(summarizeFeedback(s).reasons.headTilt.observedMs).toBe(0);
});
test('pause, recalibration, missing observations and version boundaries never imply recovery',()=>{
  for(const fault of ['pause','calibration','missing','version','gap'] as const){
    const s=session();
    for(const sample of s.samples.filter(sample=>sample.sequence>=20)){
      if(fault==='pause')sample.segment=1;
      if(fault==='calibration')sample.calibrationId='other';
      if(fault==='version')delete sample.feedback;
    }
    if(fault==='missing') {s.samples[20].state='untracked';delete s.samples[20].feedback;}
    if(fault==='gap'){s.samples[20].focusMs+=2000;s.samples[20].elapsedMs+=2000;}
    expect(summarizeFeedback(s).recovered).toBe(false);
  }
});
test('past sessions and sparse observation do not invent body-specific or comparative claims',()=>{
  const old=session();delete old.feedbackVersion;expect(postureComment(old)).toBeNull();
  const sparse=session();sparse.focusMs=300000;expect(postureComment(sparse)?.[0]).toContain('時間が短かった');
  const unavailable=session();for(const p of unavailable.samples)p.feedback!.evidence=emptyEvidence();
  expect(summarizeFeedback(unavailable).observedMs).toBe(0);
  const good=session();for(const p of good.samples){p.state='good';p.feedback!.evidence.headTilt=0;p.feedback!.evidence.headForward=0;}
  expect(postureComment(good)?.[0]).toBe('登録した姿勢をよく保てていたね。');
});
test('local checkpoints, crash recovery and finish preserve feedback but telemetry excludes it',async()=>{
  Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null},configurable:true});
  const repo=new WorkRepository(await openBrowserDriver('feedback-test'),false);await repo.initialize();
  const s=session();await repo.checkpoint(s);await repo.recover();
  const recovered=(await repo.session(s.id))!;
  expect(recovered.status).toBe('interrupted');expect(recovered.samples).toEqual(s.samples);
  expect(postureComment(recovered)).toEqual(postureComment(s));
  finishSession(s);
  const upload=measurementUpload(s,{ownerId:'owner',installationId:crypto.randomUUID(),platform:'web',channel:'web',appVersion:'test',timeZone:'Asia/Tokyo',mode:'automatic',status:'pending',consent:{version:CONSENT_VERSION,generation:1,active:true,grantedAt:s.startedAt}});
  const json=JSON.stringify(upload);expect(json).not.toContain('"feedback":');expect(json).not.toContain('headTilt');expect(json).not.toContain('observedAtMs');
});
test('pause and restart create boundaries; forced samples cannot duplicate duration',()=>{
  const s=session(), before=summarizeFeedback(s).observedMs;
  pauseSession(s,{valid:true,good:true,deviation:.2});resumeSession(s);
  advanceSession(s,40000,{valid:true,good:true,deviation:.2});
  expect(summarizeFeedback(s).observedMs).toBe(before);
  const duplicate=structuredClone(s.samples[0]);duplicate.sequence=1;s.samples=[s.samples[0],duplicate] as Sample[];
  expect(summarizeFeedback(s).observedMs).toBe(0);
});
