import { expect, test, mock } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { WorkRepository, openBrowserDriver } from '../src/features/work/repository';
import { createSession, advanceSession, finishSession, type Baseline } from '../src/features/work/model';
import { initialAccounts, CONSENT_VERSION } from '../src/features/accounts/types';

Object.assign(globalThis,{indexedDB:new IDBFactory(),localStorage:{getItem:()=>null},__APP_VERSION__:'test'});
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,userAgent:'test'},configurable:true});
const consent={version:CONSENT_VERSION,generation:1,active:true,grantedAt:new Date().toISOString()};
class AccountError extends Error {constructor(message:string,public status:number){super(message);}}
let fault:'expired'|'ack-lost'|'deleted'|null=null,remoteComplete=false;
const requests:{path:string;owner?:string}[]=[];
mock.module('../src/features/accounts/api',()=>({AccountError,accountRequest:async(path:string,_method:string,_body:unknown,owner?:string)=>{
  requests.push({path,owner});
  if(fault==='expired')throw new AccountError('Login expired',401);
  if(path==='/api/me')return {user:{id:'alice'},consent};
  if(fault==='deleted')throw new AccountError('Deleted receipt',410);
  if(path.endsWith('/complete?generation=1')){remoteComplete=true;if(fault==='ack-lost')throw new AccountError('Response lost',503);}
  return {complete:remoteComplete};
}}));
const {readAccounts,updateAccounts}=await import('../src/features/accounts/localAccounts');
const {makeTicket,flushOutbox}=await import('../src/features/accounts/outbox');
function record(id:string) {
  const s=createSession(id,{focusMinutes:1,restMinutes:0,cycles:1},0,{stats:{},headWidthRatio:1} as Baseline);
  advanceSession(s,0,{valid:true,good:true,deviation:0});advanceSession(s,1000,{valid:true,good:true,deviation:0});finishSession(s);return s;
}
test('offline, auth expiry, lost acknowledgement, account switch, and deletion retain the correct owner',async()=>{
  await readAccounts();
  const state=await updateAccounts(s=>{s.ownerId='alice';s.profiles.alice={space:'space-a',consent};s.profiles.bob={space:'space-b',consent};});
  const repo=new WorkRepository(await openBrowserDriver('space-a'),false,'alice');await repo.initialize();
  const saved=record('queued');saved.analysis=makeTicket(state,'automatic');await repo.checkpoint(saved);
  navigator.onLine=false;await flushOutbox(repo,'alice');expect(requests).toHaveLength(0);
  navigator.onLine=true;fault='expired';await expect(flushOutbox(repo,'alice')).rejects.toThrow('Login expired');
  expect((await repo.session(saved.id))?.analysis?.ownerId).toBe('alice');
  expect((await repo.session(saved.id))?.analysis?.status).toBe('pending');
  fault='ack-lost';await flushOutbox(repo,'alice');expect(remoteComplete).toBe(true);
  expect((await repo.session(saved.id))?.analysis?.status).toBe('pending');
  const beforeRetry=requests.length;fault=null;await flushOutbox(repo,'alice');
  expect(requests.slice(beforeRetry).map(r=>r.path)).toEqual(['/api/me','/api/measurements']);
  expect((await repo.session(saved.id))?.analysis?.status).toBe('sent');
  expect((await readAccounts()).profiles.alice.lastSentAt).toBeDefined();
  const later=record('later');later.analysis=makeTicket(state,'automatic');await repo.checkpoint(later);
  await updateAccounts(s=>{s.ownerId='bob';});const beforeSwitch=requests.length;await flushOutbox(repo,'alice');expect(requests).toHaveLength(beforeSwitch);
  await updateAccounts(s=>{s.ownerId='alice';s.profiles.alice.pendingStop=true;});
  expect(makeTicket(await readAccounts(),'automatic')).toBeUndefined();await flushOutbox(repo,'alice');expect(requests).toHaveLength(beforeSwitch);
  await updateAccounts(s=>{s.profiles.alice.pendingStop=false;});fault='deleted';await flushOutbox(repo,'alice');
  expect((await repo.session(later.id))?.analysis?.status).toBe('blocked');
  const blocked=requests.length;await flushOutbox(repo,'alice');expect(requests.slice(blocked).map(r=>r.path)).toEqual(['/api/me']);
  expect(requests.every(r=>r.owner==='alice')).toBe(true);
  expect(makeTicket(initialAccounts(),'automatic')).toBeUndefined();
});
test('a crash during a selected guest import is repaired before sending',async()=>{
  fault=null;remoteComplete=false;
  const state=await updateAccounts(s=>{s.profiles.alice.importSpaces=['source-guest'];});
  const source=new WorkRepository(await openBrowserDriver('source-guest'),false,'alice');await source.initialize();
  const selected=record('selected-guest');selected.analysis=makeTicket(state,'manual');await source.checkpoint(selected);
  const target=new WorkRepository(await openBrowserDriver('space-a'),false,'alice');
  expect(await target.session(selected.id)).toBeNull();await flushOutbox(target,'alice');
  expect((await target.session(selected.id))?.analysis?.status).toBe('sent');
  const guest=new WorkRepository(await openBrowserDriver('source-guest'),false,'guest');expect(await guest.session(selected.id)).toBeNull();
});
