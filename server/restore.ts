import type { Env } from './env';
import { json, HttpError } from './http';
import { requireOperator } from './export';
import { z } from 'zod';
const tombstone=z.object({userId:z.string().regex(/^[a-zA-Z0-9_-]+$/),deletedAt:z.number().int().positive(),scope:z.enum(['analysis','profile']).default('analysis'),accountDeleted:z.boolean().default(false)});
export async function reconcileRestore(env:Env,request:Request) {
  await requireOperator(env,request);
  if(env.RESTORE_LOCK!=='true')throw new HttpError(409,'Enable RESTORE_LOCK before restoring or reconciling data.');
  const cursor=new URL(request.url).searchParams.get('cursor')??undefined;
  const page=await env.TELEMETRY.list({prefix:'deletions/',cursor,limit:100});
  for(const item of page.objects) {
    const object=await env.TELEMETRY.get(item.key);if(!object)continue;
    const t=tombstone.parse(await object.json());
    if(t.scope==='profile') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM survey_responses WHERE user_id=? AND observed_at<=?').bind(t.userId,t.deletedAt),
        env.DB.prepare('DELETE FROM profile_snapshots WHERE user_id=? AND observed_at<=?').bind(t.userId,t.deletedAt),
        env.DB.prepare("UPDATE analysis_profiles SET revision=revision+1,survey_status=CASE WHEN EXISTS(SELECT 1 FROM survey_responses WHERE user_id=?) THEN survey_status ELSE 'skipped' END WHERE user_id=?").bind(t.userId,t.userId),
      ]);
      continue;
    }
    const statements=[
      env.DB.prepare('UPDATE participants SET active=0,generation=generation+1 WHERE user_id=?').bind(t.userId),
      env.DB.prepare('INSERT INTO deletion_tombstones(user_id,deleted_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET deleted_at=MAX(deleted_at,excluded.deleted_at)').bind(t.userId,t.deletedAt),
      env.DB.prepare('UPDATE measurement_receipts SET erased=1 WHERE user_id=? AND first_received<=?').bind(t.userId,t.deletedAt),
      env.DB.prepare('DELETE FROM measurements WHERE user_id=? AND received_at<=?').bind(t.userId,t.deletedAt),
      env.DB.prepare('DELETE FROM profile_snapshots WHERE user_id=? AND observed_at<=?').bind(t.userId,t.deletedAt),
      env.DB.prepare('DELETE FROM survey_responses WHERE user_id=? AND observed_at<=?').bind(t.userId,t.deletedAt),
      env.DB.prepare('DELETE FROM session WHERE userId=? AND createdAt<=?').bind(t.userId,t.deletedAt),
    ];
    if(t.accountDeleted)statements.push(env.DB.prepare('DELETE FROM user WHERE id=?').bind(t.userId));
    await env.DB.batch(statements);
  }
  return json({reconciled:page.objects.length,nextCursor:page.truncated?page.cursor:null});
}
