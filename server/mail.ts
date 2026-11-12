import type { Env } from './env';
import { CONTACT_EMAIL } from '../shared/account';
import { HttpError } from './http';

// These counters are shared by all auth mail from this Worker. External use of the
// same Resend account can only reduce the remaining provider quota, never add spend.
export async function mailAvailable(env:Env) {
  if(!env.RESEND_API_KEY)throw new HttpError(503,'メール認証は準備中です。GoogleまたはAppleをご利用ください。');
  const day=new Date().toISOString().slice(0,10),month=day.slice(0,7);
  const rows=await env.DB.prepare('SELECT bucket,count FROM mail_quotas WHERE bucket IN (?,?)').bind(`day:${day}`,`month:${month}`).all<{bucket:string;count:number}>();
  if(rows.results.some(r=>r.count>=(r.bucket.startsWith('day:')?100:3000)))throw new HttpError(429,'メール送信の上限に達しました。時間をおいて再試行してください。');
}
export async function sendAuthMail(env:Env,email:string,url:string,kind:'verify'|'reset') {
  await mailAvailable(env);
  const day=new Date().toISOString().slice(0,10),month=day.slice(0,7);
  // Reserve conservatively, including failed/uncertain deliveries. A crash or
  // provider timeout must not cause unbounded retries or accidental extra sends.
  const counts=await env.DB.batch<{count:number}>([
    env.DB.prepare('INSERT INTO mail_quotas(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(`day:${day}`,Date.now()+172800000),
    env.DB.prepare('INSERT INTO mail_quotas(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(`month:${month}`,Date.now()+35*86400000),
  ]);
  if(Number(counts[0].results[0]?.count)>100||Number(counts[1].results[0]?.count)>3000)throw new HttpError(429,'メール送信の上限に達しました。時間をおいて再試行してください。');
  const action=kind==='verify'?'メールアドレスを確認':'パスワードを再設定';
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:'PiiiN <auth@piiin.app>',to:[email],reply_to:CONTACT_EMAIL,subject:`PiiiN — ${action}`,text:`${action}\n\n${url}\n\n心当たりがない場合は、このメールを破棄してください。\nお問い合わせ: ${CONTACT_EMAIL}`}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new HttpError(response.status===429?429:503,'メールを送信できませんでした。時間をおいて再試行してください。');
}
