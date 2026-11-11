import { z, ZodError } from 'zod';
import { decryptOAuthToken } from 'better-auth/oauth2';
import { createAuth, identity, CONSENT_VERSION, revokeApple } from './auth';
import { consent, changeConsent, eraseAnalysis, upload, requireConsent } from './measurements';
import { nativeHandoff } from './native';
import { cleanup } from './maintenance';
import { exportMeasurements } from './export';
import { reconcileRestore } from './restore';
import { analysisProfile } from './profiles';
import { ensureProfile, getProfile, saveProfile, setLanguage, clearProfile } from './survey';
import { mailAvailable } from './mail';
import { json, HttpError, readJson, rateLimit, digest } from './http';
import type { Env } from './env';
import { POST as devLogin } from '../api/dev-login.js';
import { GET as devSession } from '../api/dev-session.js';
import { POST as devLogout } from '../api/dev-logout.js';
import { GET as downloadMac } from '../api/download-mac.js';

const profileScopes=['https://www.googleapis.com/auth/user.gender.read','https://www.googleapis.com/auth/user.birthday.read'];
async function route(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if(path==='/api/operator/reconcile'&&method==='POST')return reconcileRestore(env,request);
  if(env.RESTORE_LOCK==='true')throw new HttpError(503,'復旧確認中です。記録は端末に保存されます。');
  if(path==='/api/download-mac'&&method==='GET') return downloadMac();
  if(method!=='GET'&&method!=='HEAD') {
    // Native requests carry a bearer credential or an explicit, non-cookie handoff.
    const origin=request.headers.get('Origin');
    const native=path==='/api/native/create'||path==='/api/native/exchange';
    const appleCallback=path==='/api/auth/callback/apple'&&method==='POST'&&origin==='https://appleid.apple.com';
    if(!appleCallback && origin!==env.APP_ORIGIN && !(origin===null&&(native||request.headers.get('Authorization')?.startsWith('Bearer ')))) throw new HttpError(403,'Origin rejected');
  }
  const ip=request.headers.get('CF-Connecting-IP')??'local';
  if(path.startsWith('/api/dev-')) {
    await rateLimit(env.DB,`dev:${ip}`,10);
    if(path==='/api/dev-login'&&method==='POST') { await readJson(request.clone(),8192);return devLogin(request,env); }
    if(path==='/api/dev-session'&&method==='GET') return devSession(request,env);
    if(path==='/api/dev-logout'&&method==='POST') return devLogout(request);
    throw new HttpError(404,'Not found');
  }
  if(path==='/api/operator/export'&&method==='GET') return exportMeasurements(env,request);
  await rateLimit(env.DB,`api:${ip}`,240);
  let mailError:unknown;
  const auth=await createAuth(env,error=>{mailError=error;});
  if(path.startsWith('/api/auth/')) {
    if(['/api/auth/delete-user','/api/auth/delete-user/callback','/api/auth/unlink-account'].includes(path)) throw new HttpError(404,'Use account settings');
    if(path==='/api/auth/link-social') await identity(auth,request,true);
    if(['/api/auth/sign-in/social','/api/auth/link-social'].includes(path)&&method==='POST') {
      const body=await readJson(request.clone(),16384) as {provider?:string;scopes?:unknown};
      if(!['google','apple'].includes(body.provider??'')) throw new HttpError(400,'Unknown provider');
      if(body.scopes && (!Array.isArray(body.scopes)||body.scopes.some(scope=>typeof scope!=='string'||!profileScopes.includes(scope))||env.GOOGLE_PROFILE_ENABLED!=='true')) throw new HttpError(400,'Additional profile permissions are unavailable');
    }
    const emailPaths=['/api/auth/sign-up/email','/api/auth/sign-in/email','/api/auth/send-verification-email','/api/auth/request-password-reset','/api/auth/reset-password'];
    if(emailPaths.includes(path)&&method==='POST') {
      await rateLimit(env.DB,`auth:${ip}`,10);
      const body=await readJson(request.clone(),8192) as {email?:unknown};
      if(typeof body.email==='string')await rateLimit(env.DB,`email:${await digest(body.email.trim().toLowerCase())}`,3);
      if(path!=='/api/auth/sign-in/email'&&path!=='/api/auth/reset-password')await mailAvailable(env);
    }
    // Credential creation must require proof of the existing login method, not
    // merely a reset link or an authenticated social session.
    if(['/api/auth/set-password','/api/auth/link-account'].includes(path))throw new HttpError(404,'Not found');
    const response=await auth.handler(request);
    if(mailError)throw mailError;
    return response;
  }
  if(path==='/api/native/create'||path==='/api/native/exchange') {
    if(method!=='POST') throw new HttpError(405,'POST required');
    return nativeHandoff(env,auth,request,path.split('/').at(-1)!);
  }
  if(path==='/api/me'&&method==='GET') {
    const session=await auth.api.getSession({headers:request.headers});
    if(!session) return json({user:null,consent:null,providers:[],googleProfileEnabled:env.GOOGLE_PROFILE_ENABLED==='true',appleEnabled:!!env.APPLE_CLIENT_ID,emailEnabled:!!env.RESEND_API_KEY});
    const expected=request.headers.get('X-Piiin-Account');
    if(expected&&expected!==session.user.id) throw new HttpError(409,'アカウントが変わりました。');
    const providers=await env.DB.prepare('SELECT providerId FROM account WHERE userId=?').bind(session.user.id).all<{providerId:string}>();
    return json({profile:await getProfile(env,session.user.id),emailVerified:session.user.emailVerified,user:{id:session.user.id,name:session.user.name},consent:await consent(env,session.user.id),providers:providers.results.map(p=>p.providerId),googleProfileEnabled:env.GOOGLE_PROFILE_ENABLED==='true',appleEnabled:!!env.APPLE_CLIENT_ID,emailEnabled:!!env.RESEND_API_KEY});
  }
  const session=await identity(auth,request,path==='/api/account'||path==='/api/native/approve');
  const user=session.user.id;
  await rateLimit(env.DB,`user:${user}`,240);
  if(path==='/api/native/approve'&&method==='POST') return nativeHandoff(env,auth,request,'approve',user);
  if(path==='/api/consent'&&method==='POST') {
    z.object({version:z.literal(CONSENT_VERSION),agree:z.literal(true),adult:z.literal(true)}).strict().parse(await readJson(request));
    if(!session.user.emailVerified)throw new HttpError(403,'メールアドレスを確認してください。');
    await ensureProfile(env,user);
    await env.DB.prepare('UPDATE analysis_profiles SET adult_confirmed=1 WHERE user_id=?').bind(user).run();
    return json({consent:await changeConsent(env,user,true)});
  }
  if(path==='/api/consent'&&method==='DELETE') return json({consent:await changeConsent(env,user,false)});
  if(path==='/api/analysis'&&method==='DELETE') { await eraseAnalysis(env,user);ctx.waitUntil(cleanup(env));return json({deleted:true,consent:await consent(env,user)}); }
  if(path==='/api/account'&&method==='DELETE') {
    await revokeApple(env,auth,user);
    await eraseAnalysis(env,user,true);
    await env.DB.prepare('DELETE FROM user WHERE id=?').bind(user).run();
    ctx.waitUntil(cleanup(env));return json({deleted:true});
  }
  if(path==='/api/measurements'&&method==='POST') return upload(env,user,request);
  const chunk=path.match(/^\/api\/measurements\/([a-zA-Z0-9:_-]{1,120})\/(\d+|complete)$/);
  if(chunk&&method==='POST') return upload(env,user,request,chunk[1],chunk[2]);
  if(path==='/api/profile'&&method==='GET')return json({profile:await getProfile(env,user)});
  if(path==='/api/profile'&&method==='DELETE')return clearProfile(env,user,request);
  if(path==='/api/profile'&&method==='POST')return saveProfile(env,user,request);
  if(path==='/api/profile/skip'&&method==='POST')return saveProfile(env,user,request,true);
  if(path==='/api/profile/language'&&method==='POST')return setLanguage(env,user,request);
  if(path==='/api/profile/google-prefill'&&method==='POST') {
    if(env.GOOGLE_PROFILE_ENABLED!=='true')throw new HttpError(404,'Additional profile collection is disabled');
    const participation=await consent(env,user);
    if(!participation?.active)throw new HttpError(409,'分析への同意が必要です。');
    await requireConsent(env,user,participation.generation);
    const account=await env.DB.prepare("SELECT accessToken FROM account WHERE userId=? AND providerId='google'").bind(user).first<{accessToken:string|null}>();
    let person={};
    if(account?.accessToken)try {
      const token=await decryptOAuthToken(account.accessToken,await auth.$context);
      const response=await fetch('https://people.googleapis.com/v1/people/me?personFields=genders,birthdays&sources=READ_SOURCE_TYPE_PROFILE',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      if(response.ok)person=await response.json();
    } catch {/* Optional prefill must never prevent completing or skipping the survey. */}
    const profile=analysisProfile(person,new Date());
    // Preview only: never persist birthday, provider gender or unconfirmed answers.
    return json({ageYears:profile.ageYears,sexAtBirth:['male','female'].includes(profile.gender??'')?profile.gender:null});
  }
  throw new HttpError(404,'Not found');
}
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext) {
    try {
      const response=await route(request,env,ctx);
      if(new URL(request.url).pathname.startsWith('/api/')) {
        const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');
        return new Response(response.body,{status:response.status,headers});
      }
      return response;
    } catch(error) {
      if(error instanceof HttpError) return json({error:error.message},error.status);
      if(error instanceof ZodError) return json({error:'送信データの形式が正しくありません。'},400);
      // Never log request bodies, OAuth credentials, or measurement payloads.
      console.error('PiiiN request failed',error instanceof Error?error.name:'UnknownError');
      return json({error:'処理を完了できませんでした。記録は端末に残っています。'},500);
    }
  },
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext) { if(env.RESTORE_LOCK!=='true')ctx.waitUntil(cleanup(env)); },
} satisfies ExportedHandler<Env>;
