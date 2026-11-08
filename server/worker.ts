import { z, ZodError } from 'zod';
import { decryptOAuthToken } from 'better-auth/oauth2';
import { createAuth, identity, CONSENT_VERSION, revokeApple } from './auth';
import { consent, changeConsent, eraseAnalysis, upload } from './measurements';
import { nativeHandoff } from './native';
import { cleanup } from './maintenance';
import { exportMeasurements } from './export';
import { reconcileRestore } from './restore';
import { analysisProfile } from './profiles';
import { expiresAfter24Months } from '../shared/telemetry';
import { json, HttpError, readJson, rateLimit } from './http';
import type { Env } from './env';
import { POST as devLogin } from '../api/dev-login.js';
import { GET as devSession } from '../api/dev-session.js';
import { POST as devLogout } from '../api/dev-logout.js';
import { GET as downloadMac } from '../api/download-mac.js';

const profileScopes=['https://www.googleapis.com/auth/user.gender.read','https://www.googleapis.com/auth/user.birthday.read','https://www.googleapis.com/auth/user.addresses.read'];
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
  const auth=await createAuth(env);
  if(path.startsWith('/api/auth/')) {
    if(['/api/auth/delete-user','/api/auth/delete-user/callback','/api/auth/unlink-account'].includes(path)) throw new HttpError(404,'Use account settings');
    if(path==='/api/auth/link-social') await identity(auth,request,true);
    if(['/api/auth/sign-in/social','/api/auth/link-social'].includes(path)&&method==='POST') {
      const body=await readJson(request.clone(),16384) as {provider?:string;scopes?:unknown};
      if(!['google','apple'].includes(body.provider??'')) throw new HttpError(400,'Unknown provider');
      if(body.scopes && (!Array.isArray(body.scopes)||body.scopes.some(scope=>typeof scope!=='string'||!profileScopes.includes(scope))||env.GOOGLE_PROFILE_ENABLED!=='true')) throw new HttpError(400,'Additional profile permissions are unavailable');
    }
    return auth.handler(request);
  }
  if(path==='/api/native/create'||path==='/api/native/exchange') {
    if(method!=='POST') throw new HttpError(405,'POST required');
    return nativeHandoff(env,auth,request,path.split('/').at(-1)!);
  }
  if(path==='/api/me'&&method==='GET') {
    const session=await auth.api.getSession({headers:request.headers});
    if(!session) return json({user:null,consent:null,providers:[],googleProfileEnabled:env.GOOGLE_PROFILE_ENABLED==='true',appleEnabled:!!env.APPLE_CLIENT_ID});
    const expected=request.headers.get('X-Piiin-Account');
    if(expected&&expected!==session.user.id) throw new HttpError(409,'アカウントが変わりました。');
    const providers=await env.DB.prepare('SELECT providerId FROM account WHERE userId=?').bind(session.user.id).all<{providerId:string}>();
    return json({user:{id:session.user.id,name:session.user.name},consent:await consent(env,session.user.id),providers:providers.results.map(p=>p.providerId),googleProfileEnabled:env.GOOGLE_PROFILE_ENABLED==='true',appleEnabled:!!env.APPLE_CLIENT_ID});
  }
  const session=await identity(auth,request,path==='/api/account'||path==='/api/native/approve');
  const user=session.user.id;
  await rateLimit(env.DB,`user:${user}`,240);
  if(path==='/api/native/approve'&&method==='POST') return nativeHandoff(env,auth,request,'approve',user);
  if(path==='/api/consent'&&method==='POST') {
    z.object({version:z.literal(CONSENT_VERSION),agree:z.literal(true)}).strict().parse(await readJson(request));
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
  if(path==='/api/profile/google'&&method==='POST') {
    if(env.GOOGLE_PROFILE_ENABLED!=='true') throw new HttpError(404,'Additional profile collection is disabled');
    z.object({agree:z.literal(true)}).strict().parse(await readJson(request));
    const participation=await consent(env,user); if(!participation?.active) throw new HttpError(409,'分析への同意が必要です。');
    const account=await env.DB.prepare("SELECT accessToken FROM account WHERE userId=? AND providerId='google'").bind(user).first<{accessToken:string|null}>();
    let person={}; let available=false;
    if(account?.accessToken) {
      try {
        const token=await decryptOAuthToken(account.accessToken,await auth.$context);
        const response=await fetch('https://people.googleapis.com/v1/people/me?personFields=genders,birthdays,addresses',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
        if(response.ok) { person=await response.json();available=true; }
      } catch { /* Optional information must never prevent login. */ }
    }
    const profile=analysisProfile(person,new Date()), now=Date.now();
    await env.DB.prepare(`INSERT INTO profile_snapshots(id,user_id,observed_at,expires_at,gender,age_years,residence_country,source)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8 FROM participants WHERE user_id=?2 AND active=1 AND generation=?9`)
      .bind(crypto.randomUUID(),user,now,expiresAfter24Months(now),profile.gender,profile.ageYears,profile.residenceCountry,profile.source,participation.generation).run();
    return json({profile,available});
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
