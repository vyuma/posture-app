import type { WorkRepository } from '../work/repository';
import type { Session } from '../work/model';
import { isTauri } from '@tauri-apps/api/core';
import { accountRequest, AccountError } from './api';
import { readAccounts, updateAccounts } from './localAccounts';
import type { LocalAccounts, AnalysisTicket, AccountInfo, Provenance } from './types';
import { openWorkRepository } from '../work/platform';
import { CONSENT_VERSION } from './types';
import { measurementUpload } from './telemetry';

export function provenance(state:LocalAccounts):Provenance {
  return {installationId:state.installationId,platform:!isTauri()?'web':navigator.userAgent.includes('Windows')?'windows':'macos',
    channel:!isTauri()?'web':import.meta.env.VITE_DISTRIBUTION_CHANNEL??'direct',
    appVersion:__APP_VERSION__,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,metadataBasis:'recorded'};
}
export function makeTicket(state:LocalAccounts,mode:'automatic'|'manual'):AnalysisTicket|undefined {
  const profile=state.profiles[state.ownerId],consent=profile.consent;
  if(state.ownerId==='guest'||profile.pendingStop||!consent?.active||consent.version!==CONSENT_VERSION) return;
  return {ownerId:state.ownerId,...provenance(state),consent:structuredClone(consent),mode,status:'pending'};
}
export async function sendRecord(repo:WorkRepository,record:Session,ticket:AnalysisTicket) {
  const {summary,chunks}=measurementUpload(record,ticket);
  const init=await accountRequest<{complete:boolean}>('/api/measurements','POST',summary,ticket.ownerId);
  const base=`/api/measurements/${encodeURIComponent(record.id)}`;
  if(!init.complete) {
    for(const chunk of chunks) await accountRequest(`${base}/${chunk.index}?generation=${ticket.consent.generation}`,'POST',chunk,ticket.ownerId);
    await accountRequest(`${base}/complete?generation=${ticket.consent.generation}`,'POST',{},ticket.ownerId);
  }
  const sentAt=new Date().toISOString();
  await repo.setAnalysis(record.id,{...ticket,status:'sent',sentAt,error:undefined});
  await updateAccounts(state=>{ const profile=state.profiles[ticket.ownerId];if(profile) profile.lastSentAt=sentAt; });
}
let running:Promise<void>|undefined;
export function flushOutbox(repo:WorkRepository,ownerId:string) {
  return running??=(async()=>{
    if(ownerId==='guest'||!navigator.onLine) return;
    const state=await readAccounts();if(state.ownerId!==ownerId||!state.profiles[ownerId].consent?.active||state.profiles[ownerId].pendingStop) return;
    for(const space of state.profiles[ownerId].importSpaces??[]) {
      const source=await openWorkRepository(space,ownerId);
      for(const record of await source.list()) {
        if(record.analysis?.ownerId===ownerId&&record.analysis.status==='pending'&&!(await repo.session(record.id)))await repo.checkpoint(record);
      }
    }
    const info=await accountRequest<AccountInfo>('/api/me','GET',undefined,ownerId);
    if(info.user?.id!==ownerId||!info.consent?.active) return;
    for(const record of await repo.list()) {
      const ticket=record.analysis;
      if(!ticket||ticket.ownerId!==ownerId||ticket.status!=='pending'||!['completed','interrupted'].includes(record.status)) continue;
      const current=await readAccounts();if(current.ownerId!==ownerId||!current.profiles[ownerId].consent?.active) break;
      if(ticket.consent.generation!==info.consent.generation||ticket.consent.version!==info.consent.version) {
        await repo.setAnalysis(record.id,{...ticket,status:'blocked',error:'同意が変更されたため、再選択が必要です。'});continue;
      }
      try { await sendRecord(repo,record,ticket); }
      catch(error) {
        await repo.setAnalysis(record.id,{...ticket,status:error instanceof AccountError&&[400,409,410].includes(error.status)?'blocked':'pending',error:error instanceof Error?error.message:'送信待ち'});
        // Retain pending records on network/auth errors. No retry storm while offline.
        break;
      }
    }
  })().finally(()=>{running=undefined;});
}
