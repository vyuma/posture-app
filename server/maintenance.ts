import type { Env } from './env';

// Jobs remain for 24 hours: uploads already in flight may finish after deletion.
// Only generations at/before the deletion are removed; newly consented data survives.
export async function cleanup(env:Env,now=Date.now()) {
  const expired=await env.DB.prepare('SELECT user_id,id,generation FROM measurements WHERE expires_at<=? LIMIT 100').bind(now).all<{user_id:string;id:string;generation:number}>();
  for(const row of expired.results) await env.DB.batch([
    env.DB.prepare('INSERT INTO deletion_jobs(id,user_id,prefix,created_at,through_generation) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),row.user_id,`${row.user_id}/${row.generation}/${row.id}/`,now,row.generation),
    env.DB.prepare('UPDATE measurement_receipts SET erased=1 WHERE user_id=? AND measurement_id=?').bind(row.user_id,row.id),
    env.DB.prepare('DELETE FROM measurements WHERE user_id=? AND id=? AND generation=?').bind(row.user_id,row.id,row.generation),
  ]);
  const jobs=await env.DB.prepare('SELECT * FROM deletion_jobs ORDER BY created_at LIMIT 100').all<{id:string;prefix:string;created_at:number;through_generation:number}>();
  for(const job of jobs.results) {
    let cursor:string|undefined;
    do {
      const objects=await env.TELEMETRY.list({prefix:job.prefix,cursor,limit:500});
      const keys=objects.objects.filter(o=>Number(o.key.split('/')[1])<=job.through_generation).map(o=>o.key);
      if(keys.length) await env.TELEMETRY.delete(keys);
      cursor=objects.truncated?objects.cursor:undefined;
    } while(cursor);
    if(job.created_at<now-86400_000) await env.DB.prepare('DELETE FROM deletion_jobs WHERE id=?').bind(job.id).run();
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM profile_snapshots WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM native_handoffs WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM session WHERE expiresAt<=?').bind(now),
    env.DB.prepare('DELETE FROM verification WHERE expiresAt<=?').bind(now),
  ]);
}
