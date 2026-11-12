import { beforeEach, expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { WorkRepository, openBrowserDriver } from '../src/features/work/repository';
import { createSession, finishSession, advanceSession, type Baseline } from '../src/features/work/model';
import { measurementUpload } from '../src/features/accounts/telemetry';
import type { AnalysisTicket } from '../src/features/accounts/types';
import { analysisProfile } from '../server/profiles';
import { expiresAfter24Months } from '../shared/telemetry';
import { scopedKey,setActiveSpace } from '../src/features/accounts/localScope';

const ticket:AnalysisTicket={ownerId:'alice',installationId:'f3d371d2-7ce5-40ef-9d22-427e8b3966e8',platform:'web',channel:'web',appVersion:'test',timeZone:'Asia/Tokyo',mode:'automatic',status:'pending',consent:{version:'2026-11-08-v1',generation:1,active:true,grantedAt:new Date().toISOString()}};
const baseline={stats:{},headWidthRatio:1} as Baseline;
function measurement(){const s=createSession(crypto.randomUUID(),{focusMinutes:1,restMinutes:0,cycles:1},0,baseline);advanceSession(s,0,{valid:true,good:true,deviation:0});advanceSession(s,1000,{valid:true,good:true,deviation:0});advanceSession(s,2000,{valid:false,good:false,deviation:0});finishSession(s);return s;}
beforeEach(()=>{
  Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null},configurable:true});
  setActiveSpace('legacy');
});
test('guest/A/B data and settings remain separate across reopen',async()=>{
  const guest=new WorkRepository(await openBrowserDriver('legacy'),true,'guest'),a=new WorkRepository(await openBrowserDriver('space-a'),false,'alice'),b=new WorkRepository(await openBrowserDriver('space-b'),false,'bob');
  for(const r of [guest,a,b])await r.initialize();
  const s=measurement();s.analysis=ticket;await a.checkpoint(s);
  expect(await guest.list()).toHaveLength(0);expect(await b.session(s.id)).toBeNull();
  expect(await new WorkRepository(await openBrowserDriver('space-a'),false,'alice').list()).toHaveLength(1);
  expect(scopedKey('settings')).toBe('settings');setActiveSpace('space-a');expect(scopedKey('settings')).toBe('piiin.profile.space-a.settings');
});
test('selected guest records become inaccessible to other accounts and retain queue after restart',async()=>{
  const driver=await openBrowserDriver('legacy'),guest=new WorkRepository(driver,true,'guest'),alice=new WorkRepository(driver,true,'alice'),bob=new WorkRepository(driver,true,'bob');await guest.initialize();
  const s=measurement();await guest.checkpoint(s);await alice.setAnalysis(s.id,ticket);
  expect(await guest.session(s.id)).toBeNull();expect(await bob.list()).toHaveLength(0);
  await expect(bob.setAnalysis(s.id,{...ticket,ownerId:'bob'})).rejects.toThrow();
  const reopened=new WorkRepository(await openBrowserDriver('legacy'),true,'alice');expect((await reopened.session(s.id))?.analysis?.status).toBe('pending');
});
test('wire data is allowlisted; unknown tracking stays null and summary keeps exact durations',()=>{
  const s=measurement();Object.assign(s,{video:'private',landmarks:[1,2]});const data=measurementUpload(s,ticket),wire=JSON.stringify(data);
  expect(wire).not.toContain('landmarks');expect(wire).not.toContain('baseline"');expect(wire).not.toContain('video');
  expect(data.summary.focusMs).toBe(s.focusMs);expect(data.summary.validMs).toBe(s.validMs);expect(data.summary.goodMs).toBe(s.goodMs);
  expect(data.chunks[0].samples.some(v=>v.state==='untracked'&&v.score===null&&v.deviation===null)).toBe(true);
});
test('People information is optional, invalid or partial values remain null, DOB is never retained',()=>{
  const now=new Date('2026-11-08T00:00:00Z');expect(analysisProfile({},now).ageYears).toBeNull();
  expect(analysisProfile({birthdays:[{date:{month:3,day:5}}]},now).ageYears).toBeNull();
  expect(analysisProfile({birthdays:[{date:{year:2000,month:2,day:30}}]},now).ageYears).toBeNull();
  const result=analysisProfile({genders:[{value:'female'}],birthdays:[{date:{year:2000,month:11,day:9}}],addresses:[{type:'home',countryCode:'JP',streetAddress:'PRIVATE'}]},now);
  expect(result.ageYears).toBe(25);expect(result.residenceCountry).toBe('JP');expect(result.nationality).toBeNull();expect(JSON.stringify(result)).not.toContain('2000');expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(analysisProfile({addresses:[{type:'home',countryCode:'JP'},{type:'home',countryCode:'KR'}]},now).residenceCountry).toBeNull();
  expect(analysisProfile({addresses:[{type:'home',countryCode:'JP'},{type:'home',countryCode:'unknown'}]},now).residenceCountry).toBeNull();
  expect(analysisProfile({birthdays:'invalid'},now).ageYears).toBeNull();
});
test('24 calendar month retention clamps leap day without extending first receipt',()=>{
  expect(new Date(expiresAfter24Months(Date.parse('2024-02-29T12:00:00Z'))).toISOString()).toBe('2026-02-28T12:00:00.000Z');
});
