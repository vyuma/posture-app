import { invoke, isTauri } from '@tauri-apps/api/core';
export class AccountError extends Error { constructor(message:string,public status:number) { super(message); } }
export async function accountRequest<T>(path:string,method='GET',body?:unknown,ownerId?:string):Promise<T> {
  if(isTauri()) {
    const result=await invoke<{status:number;body:string}>('account_request',{path,method,body:body===undefined?null:JSON.stringify(body),ownerId:ownerId==='guest'?null:ownerId});
    const data=JSON.parse(result.body);
    if(result.status<200||result.status>=300) throw new AccountError(data.error??'通信を完了できませんでした。',result.status);
    return data;
  }
  const response=await fetch(path,{method,credentials:'same-origin',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(ownerId&&ownerId!=='guest'?{'X-Piiin-Account':ownerId}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok) throw new AccountError(data.error??'通信を完了できませんでした。',response.status);
  return data;
}
export async function startLogin(provider:'google'|'apple',link=false,profile=false) {
  if(isTauri()) {
    if(link||profile) { await invoke('account_open_settings');return; }
    await invoke('account_login',{provider});return;
  }
  const callbackURL=profile?`${location.origin}/app?profile=google`:`${location.origin}/app?account=return`;
  const data=await accountRequest<{url:string}>(link?'/api/auth/link-social':'/api/auth/sign-in/social','POST',{provider,callbackURL,errorCallbackURL:`${location.origin}/app?account=error`,...(profile?{scopes:['https://www.googleapis.com/auth/user.gender.read','https://www.googleapis.com/auth/user.birthday.read','https://www.googleapis.com/auth/user.addresses.read']}:{}),disableRedirect:true});
  location.assign(data.url);
}
export async function forgetNativeLogin() { if(isTauri()) await invoke('account_forget'); }
