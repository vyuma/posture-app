import { useEffect, useState, type FormEvent } from 'react';
import { accountRequest } from './api';
import type { AccountInfo } from './types';
import { SsoButton } from './SsoButton';
import { CONTACT_EMAIL } from '../../../shared/account';
import '../developer/developer-login.css';
import './accounts.css';
import './auth-page.css';

type Mode='login'|'signup'|'forgot-password'|'reset-password';
export function AuthPage({mode='login',nativeId}:{mode?:Mode;nativeId?:string}) {
  const query=new URLSearchParams(location.search);
  const handoff=nativeId??query.get('handoff');
  const validHandoff=handoff&&/^[a-f0-9-]{36}$/.test(handoff)?handoff:null;
  const suffix=validHandoff?`?handoff=${validHandoff}`:'';
  const callback=validHandoff?`${location.origin}/account/native?handoff=${validHandoff}`:`${location.origin}/app?account=return`;
  const [info,setInfo]=useState<AccountInfo|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(query.has('error')?'リンクが無効か、ログインを完了できませんでした。もう一度お試しください。':''),[notice,setNotice]=useState(query.has('verified')?'メールアドレスを確認しました。':'');
  const title={login:'ログイン',signup:'新規登録','forgot-password':'パスワードを忘れた方','reset-password':'パスワードを再設定'}[mode];
  useEffect(()=>{void accountRequest<AccountInfo>('/api/me').then(setInfo).catch(()=>setError('接続できませんでした。ページを再読み込みしてください。'));},[]);
  async function action(fn:()=>Promise<void>) {if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'処理を完了できませんでした。');}finally{setBusy(false);}}
  async function social(provider:'google'|'apple') {
    const scopes=provider==='google'&&info?.googleProfileEnabled?['https://www.googleapis.com/auth/user.gender.read','https://www.googleapis.com/auth/user.birthday.read']:undefined;
    const result=await accountRequest<{url:string}>('/api/auth/sign-in/social','POST',{provider,callbackURL:callback,errorCallbackURL:`${location.origin}/login${suffix}${suffix?'&':'?'}error=oauth`,disableRedirect:true,...(scopes?{scopes}:{})});
    location.assign(result.url);
  }
  async function submit(event:FormEvent) {
    event.preventDefault();await action(async()=>{
      if(mode==='login') {await accountRequest('/api/auth/sign-in/email','POST',{email,password});location.assign(callback);}
      if(mode==='signup') {await accountRequest('/api/auth/sign-up/email','POST',{email,password,name:'PiiiN',callbackURL:`${location.origin}/login${suffix}${suffix?'&':'?'}verified=1`});setPassword('');setNotice('登録できるアドレスには確認メールを送信します。登録済みの場合は、以前の方法でログインしてください。');}
      if(mode==='forgot-password') {await accountRequest('/api/auth/request-password-reset','POST',{email,redirectTo:`${location.origin}/reset-password${suffix}`});setNotice('メール・パスワードで登録済みの場合は再設定リンクを送信します。Google・Appleで登録した方は、その方法でログインしてください。');}
      if(mode==='reset-password') {await accountRequest('/api/auth/reset-password','POST',{token:query.get('token'),newPassword:password});location.assign(`/login${suffix}`);}
    });
  }
  return <main className="developer-login-page auth-page"><section className="developer-login-card" aria-busy={busy}>
    <a className="developer-login-brand" href="/app">PiiiN</a>
    <div className="developer-login-heading-group"><h1>{title}</h1></div>
    <form className="developer-login-form" onSubmit={e=>void submit(e)}>
      {mode!=='reset-password'&&<label><span>メールアドレス</span><input name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)} /></label>}
      {mode!=='forgot-password'&&<label><span>{mode==='reset-password'?'新しいパスワード':'パスワード'}</span><input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:12} maxLength={128} placeholder={mode==='login'?undefined:'12文字以上'} required value={password} onChange={e=>setPassword(e.target.value)} /></label>}
      {error&&<p className="developer-login-error" role="alert">{error}</p>}
      {notice&&<p className="auth-notice" role="status">{notice}</p>}
      {info&&!info.emailEnabled&&<p className="auth-notice">メール認証は準備中です。</p>}
      <button type="submit" disabled={busy||!info?.emailEnabled}>{busy?'処理中…':mode==='forgot-password'?'再設定メールを送信':mode==='reset-password'?'パスワードを変更':title}</button>
    </form>
    {(mode==='login'||mode==='signup')&&<>
      <div className="auth-links">{mode==='login'&&<a href={`/forgot-password${suffix}`}>パスワードを忘れた方</a>}
        <button type="button" disabled={busy||!email||!info?.emailEnabled} onClick={()=>void action(async()=>{await accountRequest('/api/auth/send-verification-email','POST',{email,callbackURL:`${location.origin}/login${suffix}${suffix?'&':'?'}verified=1`});setNotice('未確認のアドレスには確認メールを送信します。登録済みの場合はログインしてください。');})}>確認メールを再送</button></div>
      <div className="auth-divider">または</div><div className="account-sso-options auth-sso">
        <SsoButton provider="google" disabled={busy||!info} onClick={()=>void action(()=>social('google'))}/>
        <SsoButton provider="apple" disabled={busy||!info?.appleEnabled} onClick={()=>void action(()=>social('apple'))}/>
      </div></>}
    <nav className="auth-footer"><a href={`/${mode==='login'?'signup':'login'}${suffix}`}>{mode==='login'?'新規登録':'ログイン'}</a><a href="/app">ホームに戻る</a></nav>
    <footer className="auth-legal"><a href="/privacy">プライバシー</a><a href={`mailto:${CONTACT_EMAIL}`}>お問い合わせ</a></footer>
  </section></main>;
}
