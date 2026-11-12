import { useEffect, useState } from 'react';
import { accountRequest } from '../src/features/accounts/api';
import type { AccountInfo } from '../src/features/accounts/types';
import { AuthPage } from '../src/features/accounts/AuthPage';
export function NativeLogin() {
  const [info,setInfo]=useState<AccountInfo|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const id=new URLSearchParams(location.search).get('handoff');
  useEffect(()=>{void accountRequest<AccountInfo>('/api/me').then(setInfo).catch(e=>setMessage(e.message));},[]);
  async function approve() {
    setBusy(true);setMessage('');try{await accountRequest('/api/native/approve','POST',{id},info?.user?.id);setDone(true);}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  if(!id||!/^[a-f0-9-]{36}$/.test(id))return <main className="account-native-page"><h1>アプリからログインを開始してください</h1></main>;
  if(info&&!info.user)return <AuthPage nativeId={id}/>;
  return <main className="developer-login-page auth-page"><section className="developer-login-card"><a className="developer-login-brand" href="/app">PiiiN</a><div className="developer-login-heading-group"><h1>アプリに戻る</h1></div>
    {done?<p role="status">連携しました。アプリに戻ってください。</p>:info?.user?<><p>{info.user.name} としてログイン</p><div className="developer-login-form"><button disabled={busy} onClick={()=>void approve()}>このアカウントで続ける</button></div><a className="account-privacy-link" href={`/login?handoff=${id}`}>別のアカウントでログイン</a></>:<p role="status">確認中…</p>}
    {message&&<p role="alert">{message}</p>}
  </section></main>;
}
