import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { readAccounts, updateAccounts } from './localAccounts';
import { setActiveSpace, setActiveOwner } from './localScope';
import { accountRequest, forgetNativeLogin, startLogin, openAuthPage } from './api';
import type { AccountInfo, Consent, LocalAccounts } from './types';
import { CONSENT_VERSION } from './types';
import { acquireMeasurementLock } from '../work/measurementLock';
import { Dialog } from '../work/Dialog';
import { ConsentDetails } from './ConsentDetails';
import { AccountPrivacy, type AccountPrivacyAction } from './AccountPrivacy';
import './accounts.css';
import { ProfileSurvey } from './ProfileSurvey';
import { getAppLanguage } from './language';

type AccountsContext={state:LocalAccounts;info:AccountInfo|null;status:string;choosingAccount:boolean;homeRevision:number;openPrivacy:(action?:AccountPrivacyAction)=>void;openAuth:(mode:'login'|'signup')=>Promise<void>;openProfile:()=>void;refresh:()=>Promise<void>;login:(provider:'google'|'apple',link?:boolean,profile?:boolean)=>Promise<void>;logout:()=>Promise<void>;participate:(active:boolean)=>Promise<void>;erase:(account:boolean)=>Promise<void>};
const Context=createContext<AccountsContext|null>(null);
export function useAccounts() { const value=useContext(Context);if(!value) throw new Error('AccountBoundary is missing');return value; }
async function locked<T>(operation:()=>Promise<T>):Promise<T> {
  const release=await acquireMeasurementLock();if(!release)throw new Error('測定を終了してからアカウントを変更してください。');
  try{return await operation();}finally{release();}
}
function clearLoginReturn() {
  const url=new URL(location.href);url.searchParams.delete('account');history.replaceState(null,'',url.pathname+url.search+url.hash);
}
export function AccountBoundary({children}:{children:ReactNode}) {
  const [state,setState]=useState<LocalAccounts|null>(null),[info,setInfo]=useState<AccountInfo|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const [checked,setChecked]=useState(false),[privacy,setPrivacy]=useState<false|'policy'|AccountPrivacyAction>(false),[homeRevision,setHomeRevision]=useState(0);
  const [adult,setAdult]=useState(false),[editingProfile,setEditingProfile]=useState(false);
  const loginPending=useRef(new URLSearchParams(location.search).get('account')==='return');
  const oauthFailed=useRef(new URLSearchParams(location.search).get('account')==='error');
  const epoch=useRef(0),refreshing=useRef<Promise<void>|null>(null);
  const apply=useCallback((value:LocalAccounts)=>{setActiveOwner(value.ownerId);setActiveSpace(value.profiles[value.ownerId].space);setState(value);},[]);
  const refresh=useCallback(()=>{
    if(refreshing.current)return refreshing.current;
    const started=epoch.current;
    const operation=(async()=>{
      const local=await readAccounts();if(started!==epoch.current)return;apply(local);
      try {
        if(local.ownerId!=='guest'&&local.profiles[local.ownerId].pendingStop) {
          const result=await accountRequest<{consent:Consent}>('/api/consent','DELETE',undefined,local.ownerId);
          if(started!==epoch.current)return;
          apply(await updateAccounts(s=>{s.profiles[local.ownerId].consent=result.consent;s.profiles[local.ownerId].pendingStop=false;}));
        }
        const remote=await accountRequest<AccountInfo>('/api/me');if(started!==epoch.current)return;
        setInfo(remote);setStatus(oauthFailed.current?'ログインを完了できませんでした。記録は端末に残っています。再試行してください。':'');
        if(remote.user&&remote.user.id!==local.ownerId) {
          if(!loginPending.current)return;
          await locked(async()=>{
            if(started!==epoch.current)return;
            const next=await updateAccounts(s=>{
              if(s.ownerId!==local.ownerId)throw new Error('別の画面でアカウントが変更されました。再試行してください。');
              const user=remote.user!;
              // Guest records stay untouched; past records require explicit selection later.
              s.profiles[user.id]??={space:crypto.randomUUID()};s.ownerId=user.id;
              s.profiles[user.id].name=user.name;
              if(!s.profiles[user.id].pendingStop)s.profiles[user.id].consent=remote.consent??undefined;
            });
            if(started===epoch.current)apply(next);
          });
        } else if(remote.user) {
          apply(await updateAccounts(s=>{if(s.ownerId===remote.user!.id&&!s.profiles[s.ownerId].pendingStop)s.profiles[s.ownerId].consent=remote.consent??undefined;}));
        }
        if(remote.user?.id===local.ownerId&&remote.profile&&remote.profile.language!==getAppLanguage())await accountRequest('/api/profile/language','POST',{language:getAppLanguage()},remote.user.id);
        if(remote.user&&loginPending.current&&started===epoch.current){loginPending.current=false;clearLoginReturn();setPrivacy(false);setHomeRevision(v=>v+1);}
      } catch(error) {if(started===epoch.current)setStatus(error instanceof Error?error.message:'オフラインです。記録は端末に保存します。');}
      finally{if(started===epoch.current)setChecked(true);}
    })();
    refreshing.current=operation;
    const done=()=>{if(refreshing.current===operation)refreshing.current=null;};
    void operation.then(done,done);
    return operation;
  },[apply]);
  useEffect(()=>{void refresh().catch(e=>setStatus(String(e)));const channel=new BroadcastChannel('piiin-accounts');channel.onmessage=()=>{void readAccounts().then(apply);};const online=()=>{void refresh();};window.addEventListener('online',online);return()=>{channel.close();window.removeEventListener('online',online);};},[refresh,apply]);
  useEffect(()=>{setAdult(false);setEditingProfile(false);},[state?.ownerId]);
  const openAuth=async(mode:'login'|'signup')=>{
    await locked(async()=>{epoch.current++;refreshing.current=null;oauthFailed.current=false;loginPending.current=true;await openAuthPage(mode);});await refresh();
  };
  const login=async(provider:'google'|'apple',link=false,profile=false)=>{
    await locked(async()=>{epoch.current++;refreshing.current=null;oauthFailed.current=false;loginPending.current=true;await startLogin(provider,link,profile);});
    await refresh();
  };
  const logout=async()=>{await locked(async()=>{
    epoch.current++;refreshing.current=null;loginPending.current=false;clearLoginReturn();
    try{await accountRequest('/api/auth/sign-out','POST',{},state?.ownerId);}catch{/* Offline logout still makes all subsequent records guest-owned. */}
    await forgetNativeLogin();apply(await updateAccounts(s=>{s.ownerId='guest';}));setInfo(null);setStatus('');setHomeRevision(v=>v+1);
  });};
  const participate=async(active:boolean)=>{
    const owner=state!.ownerId;
    if(!active) apply(await updateAccounts(s=>{const p=s.profiles[owner];if(p.consent)p.consent.active=false;p.pendingStop=true;}));
    const result=await accountRequest<{consent:Consent}>('/api/consent',active?'POST':'DELETE',active?{version:CONSENT_VERSION,agree:true,adult:true}:undefined,owner);
    apply(await updateAccounts(s=>{if(s.ownerId!==owner)throw new Error('アカウントが変更されました。');s.profiles[owner].consent=result.consent;s.profiles[owner].pendingStop=false;}));
    if(active)setHomeRevision(v=>v+1);await refresh();
  };
  const erase=async(account:boolean)=>{await locked(async()=>{
    const owner=state!.ownerId;
    await accountRequest(account?'/api/account':'/api/analysis','DELETE',undefined,owner);
    apply(await updateAccounts(s=>{if(s.profiles[owner].consent)s.profiles[owner].consent!.active=false;if(account)s.ownerId='guest';}));
    if(account){epoch.current++;await forgetNativeLogin();setInfo(null);clearLoginReturn();setHomeRevision(v=>v+1);}else await refresh();
  });};
  async function consentAction(action:()=>Promise<void>){if(busy)return;setBusy(true);setStatus('');try{await action();}catch(e){setStatus(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  if(!state||!checked)return <main className="work-app work-loading"><p role="status">{status||'記録を読み込んでいます…'}</p>{status&&<button onClick={()=>void refresh()}>再試行</button>}</main>;
  const profile=state.profiles[state.ownerId];
  const needsConsent=checked&&state.ownerId!=='guest'&&(!profile.consent?.active||profile.consent.version!==CONSENT_VERSION||!!profile.pendingStop);
  const needsSurvey=!needsConsent&&checked&&state.ownerId!=='guest'&&info?.user?.id===state.ownerId&&info?.profile?.surveyStatus==='pending';
  return <Context.Provider value={{state,info,status,choosingAccount:needsConsent||needsSurvey||editingProfile||!!privacy,homeRevision,openAuth,openProfile:()=>setEditingProfile(true),openPrivacy:action=>setPrivacy(action??'policy'),refresh,login,logout,participate,erase}}>
    <div key={`${state.ownerId}:${profile.space}`}>{children}</div>
    {needsConsent&&!privacy&&<Dialog title="分析への参加" className="account-consent-dialog" dismissible={false} onClose={()=>{}}>
      <h2>分析への参加</h2><p className="account-consent-identity">{profile.name??'ログイン済み'}</p>
      <ConsentDetails />
      <label className="account-adult"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/>満18歳以上です</label>
      <button className="account-privacy-link" onClick={()=>setPrivacy('policy')}>プライバシー・データ管理</button>
      {status&&<p role="alert">{status}</p>}
      <div className="work-dialog-actions"><button className="work-button blue" disabled={busy||!adult} onClick={()=>void consentAction(()=>participate(true))}>{busy?'処理しています…':'同意して続ける'}</button><button className="work-button white" disabled={busy} onClick={()=>void consentAction(logout)}>ログアウト</button></div>
    </Dialog>}
    {(needsSurvey||editingProfile)&&!needsConsent&&!privacy&&<ProfileSurvey key={state.ownerId} editing={editingProfile} onComplete={()=>{setEditingProfile(false);setHomeRevision(v=>v+1);}}/>}
    {privacy&&<Dialog title={privacy==='policy'?'プライバシー・データ管理':privacy==='account'?'アカウントの削除':'分析への参加をやめる'} className={privacy==='policy'?'piiin-legal-dialog':'account-control-dialog'} onClose={()=>setPrivacy(false)}><AccountPrivacy key={privacy} action={privacy==='policy'?null:privacy} showControls={needsConsent} onComplete={()=>setPrivacy(false)} /></Dialog>}
  </Context.Provider>;
}
