import { useEffect, useState } from 'react';
import { useAccounts } from './AccountBoundary';
import { accountRequest } from './api';
import { openWorkRepository } from '../work/platform';
import { acquireMeasurementLock } from '../work/measurementLock';
import type { Session } from '../work/model';
import { readAccounts, updateAccounts } from './localAccounts';
import { flushOutbox, makeTicket } from './outbox';
import { isTauri } from '@tauri-apps/api/core';
import { SsoButton } from './SsoButton';

type Selectable={record:Session;space:string};
export function AccountSettings() {
  const account=useAccounts(),{state,info}=account,profile=state.profiles[state.ownerId],guest=state.ownerId==='guest';
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[agree,setAgree]=useState(false),[manualAgree,setManualAgree]=useState(false),[records,setRecords]=useState<Selectable[]|null>(null),[selected,setSelected]=useState<Set<string>>(new Set()),[pending,setPending]=useState(0),[confirm,setConfirm]=useState<'data'|'account'|null>(null);
  async function action(fn:()=>Promise<unknown>) {setBusy(true);setMessage('');try{await fn();await account.refresh();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function refreshCount() { const repo=await openWorkRepository(profile.space,state.ownerId);setPending((await repo.list()).filter(s=>s.analysis?.ownerId===state.ownerId&&s.analysis.status==='pending').length); }
  useEffect(()=>{void refreshCount().catch(()=>{});},[state.revision]);
  useEffect(()=>{
    if(new URLSearchParams(location.search).get('profile')==='google'&&!guest){
      history.replaceState(null,'',location.pathname);void action(async()=>{const result=await accountRequest<{available:boolean}>('/api/profile/google','POST',{agree:true},state.ownerId);setMessage(result.available?'提供された追加情報を保存しました。':'追加情報は取得できなかったため未提供として記録しました。');});
    }
  },[]);
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
    <h2 id="account-heading">アカウント・分析への参加</h2>
    <p>ログインせずに、これまでどおり利用できます。ログインだけでは測定データを送信しません。</p>
    {guest?<div className="account-sso-options"><SsoButton provider="google" disabled={busy} onClick={()=>void action(()=>account.login('google'))}/>{(info?.appleEnabled||import.meta.env.VITE_DISTRIBUTION_CHANNEL==='mac-app-store')&&<SsoButton provider="apple" disabled={busy} onClick={()=>void action(()=>account.login('apple'))}/>}</div>:<>
      <p><strong>{profile.name??'ログイン済み'}</strong><br/>{info?.user?.id===state.ownerId?'接続中':'オフライン・再ログイン待ち（記録の所属は変わりません）'}</p>
      <details><summary>再ログイン・アカウントの切り替え</summary><div className="account-sso-options"><SsoButton provider="google" disabled={busy} onClick={()=>void action(()=>account.login('google'))}/>{info?.appleEnabled&&<SsoButton provider="apple" disabled={busy} onClick={()=>void action(()=>account.login('apple'))}/>}</div></details>
      <button disabled={busy} onClick={()=>void action(account.logout)}>ログアウト</button>
      <p>参加状態：{profile.consent?.active?'参加中':'収集停止中'}<br/>最後の送信：{profile.lastSentAt?new Date(profile.lastSentAt).toLocaleString():'まだありません'} ／ 送信待ち：{pending} 件</p>
      <details><summary>収集する情報と保存期間</summary><p>利用の継続と、よい姿勢を維持する習慣の変化を分析します。測定日時、端末・アプリの版、集中・有効測定・よい姿勢の時間、約1秒ごとの点数・偏差・認識状態、休止や再登録などを送信します。映像、タイムラプス、関節座標は送信しません。身体の改善や原因を診断するものではありません。</p><p>測定・追加プロフィールは、最初の受信・取得から最大24か月保存します。削除操作後は分析対象から直ちに除外し、詳細ファイルは24時間以内に削除します。管理されたバックアップは最大30日で失効します。復元時も削除状態を適用します。参加しない場合も全機能を利用できます。</p></details>
      {!profile.consent?.active?<><label><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/> 上記の目的・項目・保存期間に同意し、今後の測定を自動送信する</label><button className="work-button blue" disabled={busy||!agree} onClick={()=>void action(()=>account.participate(true))}>分析に参加する</button></>:<button disabled={busy} onClick={()=>void action(()=>account.participate(false))}>今後の収集を停止する</button>}
      <div className="account-actions"><button disabled={busy||!profile.consent?.active} onClick={()=>void action(listRecords)}>ローカル記録を選んで送信</button><button disabled={busy} onClick={()=>void action(async()=>{await flushOutbox(await openWorkRepository(profile.space,state.ownerId),state.ownerId);await refreshCount();})}>送信を再試行</button></div>
      {records&&<fieldset className="account-records"><legend>送信する記録</legend><p>現在のアカウントと未帰属の記録だけを表示します。選んだゲスト記録はこのアカウントに所属します。</p>{!records.length&&<p>送信できる未送信の記録はありません。</p>}
        {records.map(({record})=><label key={record.id}><input type="checkbox" checked={selected.has(record.id)} onChange={e=>setSelected(current=>{const next=new Set(current);if(e.target.checked)next.add(record.id);else next.delete(record.id);return next;})}/><span>{new Date(record.startedAt).toLocaleString()} ／ {Math.round(record.focusMs/60000)}分{record.legacy?'（旧形式）':''}{record.analysis?.error&&<small>{record.analysis.error}</small>}</span></label>)}
        <label><input type="checkbox" checked={manualAgree} onChange={e=>setManualAgree(e.target.checked)}/> 選択した記録は自分のもので、説明した項目の送信に同意します。</label><button className="work-button blue" disabled={busy||!manualAgree||!selected.size} onClick={()=>void action(selectUpload)}>{selected.size}件を送信</button><button disabled={busy} onClick={()=>setRecords(null)}>キャンセル</button>
      </fieldset>}
      {info?.googleProfileEnabled&&profile.consent?.active&&<details><summary>任意の追加プロフィール</summary><p>Googleが提供できる性別、取得時点の年齢、明確な居住国だけを保存します。生年月日・住所そのものと国籍は保存しません。提供しない項目は未提供として扱い、ログインには影響しません。</p><button disabled={busy} onClick={()=>void action(()=>account.login('google',true,true))}>追加情報の提供を選ぶ</button></details>}
      <details><summary>ログイン方法を追加する</summary><p>現在の方法で再ログインしたあと、追加する方法でも本人確認します。同じメールアドレスだけでは連携しません。別の分析アカウントとして登録済みの方法は統合できません。</p>{isTauri()?<button disabled={busy} onClick={()=>void action(()=>account.login('google',true))}>ブラウザで連携を管理</button>:<div className="account-actions">{!info?.providers.includes('google')&&<button disabled={busy} onClick={()=>void action(()=>account.login('google',true))}>Google を連携</button>}{info?.appleEnabled&&!info.providers.includes('apple')&&<button disabled={busy} onClick={()=>void action(()=>account.login('apple',true))}>Apple を連携</button>}</div>}</details>
      <div className="account-actions"><button disabled={busy} onClick={()=>setConfirm('data')}>サーバーの分析データを削除</button><button disabled={busy} onClick={()=>setConfirm('account')}>アカウントを削除</button></div>
      {confirm&&<div role="group" aria-label="削除の確認"><p>{confirm==='account'?'ログイン方法・セッション・分析データを削除します。直前の再ログインが必要です。':'サーバーの分析データを削除し、収集を停止します。削除した測定IDは再送信できません。'} ローカル記録はこの端末に残ります。</p><button disabled={busy} onClick={()=>void action(async()=>{await account.erase(confirm==='account');setConfirm(null);})}>削除を実行する</button><button disabled={busy} onClick={()=>setConfirm(null)}>キャンセル</button></div>}
    </>}
    {(busy||message||account.status)&&<p role="status">{busy?'処理しています…':message||account.status}</p>}
  </section>;
}
