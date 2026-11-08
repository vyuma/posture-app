import { useEffect, useState } from 'react';
import { accountRequest } from '../src/features/accounts/api';
import type { AccountInfo } from '../src/features/accounts/types';
import { SsoButton } from '../src/features/accounts/SsoButton';
import '../src/features/accounts/accounts.css';
export function NativeLogin() {
  const [info,setInfo]=useState<AccountInfo|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const query=new URLSearchParams(location.search),id=query.get('handoff');
  useEffect(()=>{void accountRequest<AccountInfo>('/api/me').then(setInfo).catch(e=>setMessage(e.message));},[]);
  async function login(selected:'google'|'apple') {
    setBusy(true);setMessage('');try{const result=await accountRequest<{url:string}>('/api/auth/sign-in/social','POST',{provider:selected,callbackURL:location.href,disableRedirect:true});location.assign(result.url);}catch(e){setMessage(e instanceof Error?e.message:String(e));setBusy(false);}
  }
  async function approve() {
    setBusy(true);setMessage('');try{await accountRequest('/api/native/approve','POST',{id},info?.user?.id);setDone(true);}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  if(!id||!/^[a-f0-9-]{36}$/.test(id))return <main className="account-native-page"><h1>アプリからログインを開始してください</h1></main>;
  return <main className="account-native-page account-settings"><h1>PiiiN にログイン</h1>{done?<p role="status">連携しました。この画面を閉じてアプリに戻れます。</p>:<><p>この端末のPiiiNアプリから開始したログインだけを許可してください。ログインだけでは測定データを送信しません。</p>{info?.user&&<><p>{info.user.name} としてアプリにログインします。</p><button disabled={busy} onClick={()=>void approve()}>このアカウントでアプリに戻る</button></>}<div className="account-sso-options"><SsoButton provider="google" disabled={busy} onClick={()=>void login('google')}/>{info?.appleEnabled&&<SsoButton provider="apple" disabled={busy} onClick={()=>void login('apple')}/>}</div></>}{message&&<p role="alert">{message}</p>}</main>;
}
