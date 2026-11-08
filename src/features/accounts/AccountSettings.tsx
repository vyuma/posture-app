import { useEffect, useState } from 'react';
import { useAccounts } from './AccountBoundary';
import { openWorkRepository } from '../work/platform';
import { acquireMeasurementLock } from '../work/measurementLock';
import type { Session } from '../work/model';
import { readAccounts, updateAccounts } from './localAccounts';
import { flushOutbox, makeTicket } from './outbox';
import { SsoButton } from './SsoButton';

type Selectable={record:Session;space:string};
export function AccountSettings() {
  const account=useAccounts(),{state,info}=account,profile=state.profiles[state.ownerId],guest=state.ownerId==='guest';
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[manualAgree,setManualAgree]=useState(false),[records,setRecords]=useState<Selectable[]|null>(null),[selected,setSelected]=useState<Set<string>>(new Set()),[pending,setPending]=useState(0);
  async function action(fn:()=>Promise<unknown>) {setBusy(true);setMessage('');try{await fn();await account.refresh();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function refreshCount() { const repo=await openWorkRepository(profile.space,state.ownerId);setPending((await repo.list()).filter(s=>s.analysis?.ownerId===state.ownerId&&s.analysis.status==='pending').length); }
  useEffect(()=>{void refreshCount().catch(()=>{});},[state.revision]);
  async function listRecords() {
    const spaces=[profile.space,state.profiles.guest.space,...profile.importSpaces??[]],result:Selectable[]=[],seen=new Set<string>();
    for(const space of new Set(spaces)) {
      const repo=await openWorkRepository(space,state.ownerId);await repo.initialize();
      for(const record of await repo.list()) {
        if(seen.has(record.id)||!['completed','interrupted'].includes(record.status)||record.analysis?.status==='sent')continue;
        seen.add(record.id);result.push({record,space});
      }
    }
    setRecords(result.sort((a,b)=>b.record.startedAt.localeCompare(a.record.startedAt)));setSelected(new Set());setManualAgree(false);
  }
  async function selectUpload() {
    if(!manualAgree||!selected.size)throw new Error('送信する記録と確認欄を選んでください。');
    const release=await acquireMeasurementLock();if(!release)throw new Error('測定を終了してから送信記録を選んでください。');
    try {
      const local=await readAccounts();if(local.ownerId!==state.ownerId)throw new Error('アカウントが変更されました。');
      const ticket=makeTicket(local,'manual');if(!ticket)throw new Error('先に分析への参加を選んでください。');
      const target=await openWorkRepository(profile.space,state.ownerId);
      for(const {record,space} of records??[]) {
        if(!selected.has(record.id))continue;
        const source=await openWorkRepository(space,state.ownerId),latest=await source.session(record.id);
        if(!latest)throw new Error('選択した記録の所有者が変更されました。');
        if(space!==profile.space)await updateAccounts(s=>{const p=s.profiles[state.ownerId];p.importSpaces=[...new Set([...(p.importSpaces??[]),space])];});
        const metadata=record.provenance??{...ticket,appVersion:'unknown',timeZone:'unknown',metadataBasis:'reconstructed' as const};
        const selectedTicket={...ticket,...metadata,mode:'manual' as const,status:'pending' as const,consent:ticket.consent,ownerId:state.ownerId};
        await source.setAnalysis(record.id,selectedTicket);
        if(space!==profile.space)await target.checkpoint({...record,analysis:selectedTicket});
        await target.setAnalysis(record.id,selectedTicket);
      }
      setRecords(null);await flushOutbox(target,state.ownerId);await refreshCount();
    }finally{release();}
  }
  return <section className="account-settings" aria-labelledby="account-heading" aria-busy={busy}>
    <h2 id="account-heading">アカウント</h2>
    {guest&&<p>ログインは分析に参加する方のための機能です。ログインせずに利用することもできます。</p>}
    {guest?<div className="account-sso-options"><SsoButton provider="google" disabled={busy} onClick={()=>void action(()=>account.login('google'))}/>{(info?.appleEnabled||import.meta.env.VITE_DISTRIBUTION_CHANNEL==='mac-app-store')&&<SsoButton provider="apple" disabled={busy} onClick={()=>void action(()=>account.login('apple'))}/>}</div>:<>
      <p><strong>{profile.name??'ログイン済み'}</strong></p>
      <div className="account-actions"><button disabled={busy} onClick={()=>void action(account.logout)}>ログアウト</button></div>
      <div className="account-actions"><button disabled={busy||!profile.consent?.active} onClick={()=>void action(listRecords)}>ローカル記録を選んで送信</button><button disabled={busy} onClick={()=>void action(async()=>{await flushOutbox(await openWorkRepository(profile.space,state.ownerId),state.ownerId);await refreshCount();})}>送信を再試行</button></div>
      <p className="account-transfer-status">送信待ち：{pending}件{profile.lastSentAt&&<> ／ 最後の送信：{new Date(profile.lastSentAt).toLocaleString()}</>}</p>
      {records&&<fieldset className="account-records"><legend>送信する記録</legend><p>現在のアカウントと未帰属の記録だけを表示します。選んだゲスト記録はこのアカウントに所属します。</p>{!records.length&&<p>送信できる未送信の記録はありません。</p>}
        {records.map(({record})=><label key={record.id}><input type="checkbox" checked={selected.has(record.id)} onChange={e=>setSelected(current=>{const next=new Set(current);if(e.target.checked)next.add(record.id);else next.delete(record.id);return next;})}/><span>{new Date(record.startedAt).toLocaleString()} ／ {Math.round(record.focusMs/60000)}分{record.legacy?'（旧形式）':''}{record.analysis?.error&&<small>{record.analysis.error}</small>}</span></label>)}
        <label><input type="checkbox" checked={manualAgree} onChange={e=>setManualAgree(e.target.checked)}/> 選択した記録は自分のもので、説明した項目の送信に同意します。</label><button className="work-button blue" disabled={busy||!manualAgree||!selected.size} onClick={()=>void action(selectUpload)}>{selected.size}件を送信</button><button disabled={busy} onClick={()=>setRecords(null)}>キャンセル</button>
      </fieldset>}
    </>}
    {(busy||message||account.status)&&<p role="status">{busy?'処理しています…':message||account.status}</p>}
  </section>;
}
