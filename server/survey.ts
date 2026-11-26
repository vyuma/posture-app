import { z } from 'zod';
import type { Env } from './env';
import type { AnalysisProfile } from '../shared/account';
import { expiresAfter24Months } from '../shared/telemetry';
import { CONSENT_VERSION } from '../shared/account';
import { HttpError, json, readJson } from './http';

export async function ensureProfile(env: Env, user: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO analysis_profiles(user_id,analysis_id) VALUES(?,?)').bind(user,crypto.randomUUID()).run();
}
export async function getProfile(env: Env, user: string): Promise<AnalysisProfile> {
  await ensureProfile(env,user);
  return (await env.DB.prepare(`SELECT p.analysis_id AS analysisId,p.revision,p.survey_status AS surveyStatus,p.language,
    r.sex_at_birth AS sexAtBirth,r.age_years AS ageYears,r.observed_at AS observedAt,r.sex_source AS sexSource,r.age_source AS ageSource
    FROM analysis_profiles p LEFT JOIN survey_responses r ON r.id=(SELECT id FROM survey_responses WHERE user_id=p.user_id AND expires_at>? ORDER BY observed_at DESC,rowid DESC LIMIT 1) WHERE p.user_id=?`).bind(Date.now(),user).first<AnalysisProfile>())!;
}
const language=z.enum(['ja','ko','en']);
const source=z.enum(['user','google_prefill']).nullable();
const responseSchema=z.object({requestId:z.string().uuid(),generation:z.number().int().positive(),revision:z.number().int().nonnegative(),ageYears:z.number().int().min(0).max(120).nullable(),sexAtBirth:z.enum(['female','male','other']).nullable(),ageSource:source,sexSource:source,language}).strict();
export async function saveProfile(env: Env, user: string, request: Request, skip=false) {
  const body=responseSchema.parse(await readJson(request));
  const p=await env.DB.prepare(`SELECT p.generation FROM participants p JOIN analysis_profiles a ON a.user_id=p.user_id JOIN user u ON u.id=p.user_id WHERE p.user_id=? AND p.active=1 AND p.version=? AND p.generation=? AND a.adult_confirmed=1 AND u.emailVerified=1`).bind(user,CONSENT_VERSION,body.generation).first();
  if(!p)throw new HttpError(409,'分析への同意を確認してください。');
  if(!skip&&body.ageYears!==null&&body.ageYears<18) {
    await env.DB.batch([
      env.DB.prepare('UPDATE participants SET active=0,generation=generation+1 WHERE user_id=?').bind(user),
      env.DB.prepare('UPDATE analysis_profiles SET adult_confirmed=0 WHERE user_id=?').bind(user),
    ]);
    return json({ineligible:true});
  }
  const now=Date.now(),age=skip?null:body.ageYears,sex=skip?null:body.sexAtBirth;
  // A stable request ID makes a lost acknowledgement safe to retry without extending retention.
  const prior=await env.DB.prepare('SELECT user_id,sex_at_birth,age_years,skipped,language,sex_source,age_source FROM survey_responses WHERE id=?').bind(body.requestId).first<{user_id:string;sex_at_birth:string|null;age_years:number|null;skipped:number;language:string;sex_source:string|null;age_source:string|null}>();
  if(prior){if(prior.user_id!==user||prior.sex_at_birth!==sex||prior.age_years!==age||prior.skipped!==(skip?1:0)||prior.language!==body.language||prior.sex_source!==(sex?body.sexSource:null)||prior.age_source!==(age===null?null:body.ageSource))throw new HttpError(409,'再試行してください。');return json({profile:await getProfile(env,user)});}
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO survey_responses(id,user_id,observed_at,expires_at,sex_at_birth,age_years,sex_source,age_source,language,skipped)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10 FROM participants WHERE user_id=?2 AND active=1 AND generation=?11 AND version=?12 AND EXISTS(SELECT 1 FROM analysis_profiles WHERE user_id=?2 AND revision=?13)` )
      .bind(body.requestId,user,now,expiresAfter24Months(now),sex,age,sex?body.sexSource:null,age===null?null:body.ageSource,body.language,skip?1:0,body.generation,CONSENT_VERSION,body.revision),
    env.DB.prepare(`UPDATE analysis_profiles SET survey_status=?,language=?,revision=revision+1 WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM survey_responses WHERE id=? AND user_id=?)`).bind(skip?'skipped':'completed',body.language,user,body.revision,body.requestId,user),
  ]);
  const saved=await env.DB.prepare('SELECT id FROM survey_responses WHERE id=? AND user_id=?').bind(body.requestId,user).first();
  if(!saved)throw new HttpError(409,'同意が変更されました。');
  return json({profile:await getProfile(env,user)});
}
export async function setLanguage(env:Env,user:string,request:Request) {
  const body=z.object({language}).strict().parse(await readJson(request));
  await ensureProfile(env,user);
  await env.DB.prepare('UPDATE analysis_profiles SET language=? WHERE user_id=?').bind(body.language,user).run();
  return json({language:body.language});
}

export async function clearProfile(env:Env,user:string,request:Request) {
  z.object({revision:z.number().int().nonnegative()}).strict().parse(await readJson(request));
  await ensureProfile(env,user);
  const now=Date.now();
  // Preserve this receipt independently before deleting. A concurrently submitted
  // later answer is a new response, not a restoration of the deleted answer.
  await env.TELEMETRY.put(`deletions/${user}/profile-${now}-${crypto.randomUUID()}.json`,JSON.stringify({userId:user,deletedAt:now,scope:'profile'}));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM survey_responses WHERE user_id=? AND observed_at<=?').bind(user,now),
    env.DB.prepare('DELETE FROM profile_snapshots WHERE user_id=? AND observed_at<=?').bind(user,now),
    env.DB.prepare("UPDATE analysis_profiles SET revision=revision+1,survey_status=CASE WHEN EXISTS(SELECT 1 FROM survey_responses WHERE user_id=?) THEN survey_status ELSE 'skipped' END WHERE user_id=?").bind(user,user),
  ]);
  return json({profile:await getProfile(env,user)});
}
