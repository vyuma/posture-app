import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccounts } from './AccountBoundary';
import { accountRequest } from './api';
import { Dialog } from '../work/Dialog';
import type { SexAtBirth } from '../../../shared/account';
import { getAppLanguage } from './language';
import './auth-page.css';
export function ProfileSurvey({editing=false,onComplete}:{editing?:boolean;onComplete:()=>void}) {
  const account=useAccounts(),initial=account.info?.profile,owner=account.state.ownerId;
  const [age,setAge]=useState(initial?.ageYears?.toString()??''),[sex,setSex]=useState<SexAtBirth|''>(initial?.sexAtBirth??'');
  const [ageGoogle,setAgeGoogle]=useState(false),[sexGoogle,setSexGoogle]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dirty=useRef({age:false,sex:false}),submitted=useRef(false),request=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{
    let live=true;
    if(!editing&&account.info?.googleProfileEnabled&&account.info.providers.includes('google'))void accountRequest<{ageYears:number|null;sexAtBirth:'male'|'female'|null}>('/api/profile/google-prefill','POST',{},owner).then(p=>{
      if(!live||submitted.current)return;
      if(!dirty.current.age&&p.ageYears!==null){setAge(String(p.ageYears));setAgeGoogle(true);}
      if(!dirty.current.sex&&p.sexAtBirth){setSex(p.sexAtBirth);setSexGoogle(true);}
    }).catch(()=>{});
    return()=>{live=false;};
  },[owner,editing,account.info?.googleProfileEnabled]);
  async function save(skip:boolean) {
    if(busy)return;submitted.current=true;setBusy(true);setError('');
    try {
      const body={revision:initial?.revision??0,generation:account.state.profiles[owner].consent?.generation,ageYears:skip||age===''?null:Number(age),sexAtBirth:skip||sex===''?null:sex,ageSource:skip||age===''?null:ageGoogle?'google_prefill':'user',sexSource:skip||sex===''?null:sexGoogle?'google_prefill':'user',language:getAppLanguage()};
      const signature=JSON.stringify(body)+skip;
      if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
      const result=editing&&skip?await accountRequest<{ineligible?:boolean}>('/api/profile','DELETE',{revision:initial?.revision??0},owner):await accountRequest<{ineligible?:boolean}>(skip?'/api/profile/skip':'/api/profile','POST',{...body,requestId:request.current.id},owner);
      if(result.ineligible){await account.participate(false);await account.logout();onComplete();return;}
      await account.refresh();onComplete();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <Dialog title="プロフィール" className="account-consent-dialog" dismissible={editing&&!busy} onClose={onComplete}>
    <h2>プロフィール</h2><form className="profile-form" onSubmit={(e:FormEvent)=>{e.preventDefault();void save(false);}}>
      <label><span>年齢（満年齢）</span><input type="number" inputMode="numeric" min={0} max={120} step={1} value={age} onChange={e=>{dirty.current.age=true;setAgeGoogle(false);setAge(e.target.value);}} /></label>
      <label><span>出生時の性別</span><select value={sex} onChange={e=>{dirty.current.sex=true;setSexGoogle(false);setSex(e.target.value as SexAtBirth|'');}}><option value="">回答しない</option><option value="female">女性</option><option value="male">男性</option><option value="other">その他</option></select></label>
      {error&&<p role="alert">{error}</p>}
      <div className="work-dialog-actions"><button className="work-button blue" disabled={busy} type="submit">{busy?'保存中…':'保存して続ける'}</button><button className="work-button white" disabled={busy} type="button" onClick={()=>void save(true)}>{editing?'回答を削除':'スキップ'}</button></div>
    </form>
  </Dialog>;
}
