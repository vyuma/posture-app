import { invoke, isTauri } from '@tauri-apps/api/core';
export class AccountError extends Error { constructor(message:string,public status:number) { super(message); } }
const authErrors:Record<string,string>={
  INVALID_EMAIL_OR_PASSWORD:'メールアドレスまたはパスワードが正しくありません。',
  EMAIL_NOT_VERIFIED:'確認メールのリンクからメールアドレスを確認してください。',
  INVALID_TOKEN:'リンクの有効期限が切れたか、使用済みです。再送してください。',
  TOKEN_EXPIRED:'リンクの有効期限が切れました。再送してください。',
  PASSWORD_TOO_SHORT:'パスワードは12文字以上で入力してください。',
  PASSWORD_TOO_LONG:'パスワードは128文字以内で入力してください。',
};
function failure(data:{error?:string;code?:string}){return data.error??authErrors[data.code??'']??'処理を完了できませんでした。時間をおいて再試行してください。';}
export async function accountRequest<T>(path:string,method='GET',body?:unknown,ownerId?:string):Promise<T> {
  if(isTauri()) {
    const result=await invoke<{status:number;body:string}>('account_request',{path,method,body:body===undefined?null:JSON.stringify(body),ownerId:ownerId==='guest'?null:ownerId});
    const data=JSON.parse(result.body);
    if(result.status<200||result.status>=300) throw new AccountError(failure(data),result.status);
    return data;
  }
  const response=await fetch(path,{method,credentials:'same-origin',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(ownerId&&ownerId!=='guest'?{'X-Piiin-Account':ownerId}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok) throw new AccountError(failure(data),response.status);
  return data;
}
export async function startLogin(provider:'google'|'apple',link=false,profile=false) {
  if(isTauri()) {
    if(link||profile) { await invoke('account_open_settings');return; }
    await invoke('account_login',{provider});return;
  }
  const callbackURL=profile?`${location.origin}/app?profile=google`:`${location.origin}/app?account=return`;
  const data=await accountRequest<{url:string}>(link?'/api/auth/link-social':'/api/auth/sign-in/social','POST',{provider,callbackURL,errorCallbackURL:`${location.origin}/app?account=error`,...(profile?{scopes:['https://www.googleapis.com/auth/user.gender.read','https://www.googleapis.com/auth/user.birthday.read']}:{}),disableRedirect:true});
  location.assign(data.url);
}
export async function forgetNativeLogin() { if(isTauri()) await invoke('account_forget'); }

export async function openAuthPage(mode:'login'|'signup') {
  if(isTauri()){await invoke('account_login',{provider:mode});return;}
  location.assign(`/${mode}`);
}
