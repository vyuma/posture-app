import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { readAccounts, updateAccounts } from './localAccounts';
import { setActiveSpace, setActiveOwner } from './localScope';
import { accountRequest, forgetNativeLogin, startLogin } from './api';
import type { AccountInfo, Consent, LocalAccounts } from './types';
import { CONSENT_VERSION } from './types';
import { acquireMeasurementLock } from '../work/measurementLock';
import { Dialog } from '../work/Dialog';
import './accounts.css';

type AccountsContext={state:LocalAccounts;info:AccountInfo|null;status:string;choosingAccount:boolean;refresh:()=>Promise<void>;login:(provider:'google'|'apple',link?:boolean,profile?:boolean)=>Promise<void>;logout:()=>Promise<void>;participate:(active:boolean)=>Promise<void>;erase:(account:boolean)=>Promise<void>};
const Context=createContext<AccountsContext|null>(null);
export function useAccounts() { const value=useContext(Context);if(!value) throw new Error('AccountBoundary is missing');return value; }
export function AccountBoundary({children}:{children:ReactNode}) {
  const [state,setState]=useState<LocalAccounts|null>(null),[info,setInfo]=useState<AccountInfo|null>(null),[candidate,setCandidate]=useState<AccountInfo|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const loginPending=useRef(new URLSearchParams(location.search).get('account')==='return');
  const oauthFailed=useRef(new URLSearchParams(location.search).get('account')==='error');
  const apply=useCallback((value:LocalAccounts)=>{setActiveOwner(value.ownerId);setActiveSpace(value.profiles[value.ownerId].space);setState(value);},[]);
  const refresh=useCallback(async()=>{
    const local=await readAccounts();apply(local);
    try {
      if(local.ownerId!=='guest'&&local.profiles[local.ownerId].pendingStop) {
        const result=await accountRequest<{consent:Consent}>('/api/consent','DELETE',undefined,local.ownerId);
        apply(await updateAccounts(s=>{s.profiles[local.ownerId].consent=result.consent;s.profiles[local.ownerId].pendingStop=false;}));
      }
      const remote=await accountRequest<AccountInfo>('/api/me');setInfo(remote);setStatus(oauthFailed.current?'ログインや追加権限の設定を完了できませんでした。記録は端末に残っています。必要なときに再試行してください。':'');
      if(remote.user&&remote.user.id!==local.ownerId) {if(loginPending.current)setCandidate(remote);return;}
      if(remote.user) {
        loginPending.current=false;
        apply(await updateAccounts(s=>{if(s.ownerId===remote.user!.id&&!s.profiles[s.ownerId].pendingStop)s.profiles[s.ownerId].consent=remote.consent??undefined;}));
      }
    } catch(error) {setStatus(error instanceof Error?error.message:'オフラインです。記録は端末に保存します。');}
  },[apply]);
  useEffect(()=>{void refresh().catch(e=>setStatus(String(e)));const channel=new BroadcastChannel('piiin-accounts');channel.onmessage=()=>{void readAccounts().then(apply);};const online=()=>{void refresh();};window.addEventListener('online',online);return()=>{channel.close();window.removeEventListener('online',online);};},[refresh,apply]);
  async function locked<T>(operation:()=>Promise<T>):Promise<T> {
    const release=await acquireMeasurementLock();if(!release)throw new Error('測定を終了してからアカウントを変更してください。');
    try{return await operation();}finally{release();}
  }
  async function choose(adopt:boolean) {
    if(!candidate?.user)return;
    setBusy(true);setStatus('');
    try{await locked(async()=>{
      const remote=await accountRequest<AccountInfo>('/api/me','GET',undefined,candidate.user!.id);if(!remote.user)throw new Error('ログインし直してください。');
      apply(await updateAccounts(s=>{
        const user=remote.user!;const exists=!!s.profiles[user.id];
        if(adopt&&(s.ownerId!=='guest'||exists))throw new Error('このアカウントには既にローカル記録があります。個別の選択送信を利用してください。');
        s.profiles[user.id]??={space:adopt?s.profiles.guest.space:crypto.randomUUID()};
        if(adopt)s.profiles.guest={space:crypto.randomUUID()};
        s.ownerId=user.id;s.profiles[user.id].name=user.name;s.profiles[user.id].consent=remote.consent??undefined;
      }));loginPending.current=false;setCandidate(null);setInfo(remote);
    });}catch(e){setStatus(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  const login=async(provider:'google'|'apple',link=false,profile=false)=>{await locked(async()=>{oauthFailed.current=false;loginPending.current=true;await startLogin(provider,link,profile);await refresh();});};
  const logout=async()=>{await locked(async()=>{
    loginPending.current=false;
    try{await accountRequest('/api/auth/sign-out','POST',{},state?.ownerId);}catch{/* An explicit offline logout must still switch new records to guest. */}
    await forgetNativeLogin();apply(await updateAccounts(s=>{s.ownerId='guest';}));setInfo(null);setCandidate(null);
  });};
  const participate=async(active:boolean)=>{
    if(!active) apply(await updateAccounts(s=>{const p=s.profiles[state!.ownerId];if(p.consent)p.consent.active=false;p.pendingStop=true;}));
    const result=await accountRequest<{consent:Consent}>('/api/consent',active?'POST':'DELETE',active?{version:CONSENT_VERSION,agree:true}:undefined,state!.ownerId);
    apply(await updateAccounts(s=>{s.profiles[state!.ownerId].consent=result.consent;s.profiles[state!.ownerId].pendingStop=false;}));await refresh();
  };
  const erase=async(account:boolean)=>{
    await locked(async()=>{
      const owner=state!.ownerId;
      await accountRequest(account?'/api/account':'/api/analysis','DELETE',undefined,owner);
      apply(await updateAccounts(s=>{if(s.profiles[owner].consent)s.profiles[owner].consent!.active=false;if(account)s.ownerId='guest';}));
      if(account){await forgetNativeLogin();setInfo(null);}else await refresh();
    });
  };
  if(!state)return <main className="work-app work-loading"><p role="status">{status||'記録を読み込んでいます…'}</p>{status&&<button onClick={()=>void refresh()}>再試行</button>}</main>;
  return <Context.Provider value={{state,info,status,choosingAccount:!!candidate?.user,refresh,login,logout,participate,erase}}><div key={`${state.ownerId}:${state.profiles[state.ownerId].space}`}>{children}</div>
    {candidate?.user&&<Dialog title="この端末の記録" onClose={()=>{loginPending.current=false;setCandidate(null);}}><h2>{candidate.user.name} でログイン</h2><p>ログインだけでは測定データを送信しません。分析への参加は設定から選べます。</p>
      {state.ownerId==='guest'&&!state.profiles[candidate.user.id]&&<><p>現在のゲスト記録・キャラクター・設定を、このアカウントのローカル記録として引き継ぎますか？ 過去の記録は自動送信しません。</p><button className="work-button blue" disabled={busy} onClick={()=>void choose(true)}>自分の記録として引き継ぐ</button></>}
      <button className="work-button white" disabled={busy} onClick={()=>void choose(false)}>アカウントの記録を開く</button>{status&&<p role="alert">{status}</p>}
    </Dialog>}
  </Context.Provider>;
}
