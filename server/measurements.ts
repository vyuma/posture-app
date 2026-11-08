import { chunkSchema, summarySchema, expiresAfter24Months, type MeasurementSummary, type MeasurementChunk } from '../shared/telemetry';
import type { Env } from './env';
import { digest, HttpError, json, readJson } from './http';
import { CONSENT_VERSION } from './auth';

type Row = { summary: string; digest: string; received_at: number; expires_at: number; completed_at: number|null; generation: number };
function content(value:MeasurementSummary) {
  const {consentVersion:_v,consentGeneration:_g,mode:_m,...data}=value;
  return JSON.stringify(data);
}
export async function consent(env: Env, user: string) {
  const row = await env.DB.prepare('SELECT active,generation,version,granted_at FROM participants WHERE user_id=?').bind(user).first<{ active: number; generation: number; version: string; granted_at: string }>();
  return row ? { active: !!row.active, generation: row.generation, version: row.version, grantedAt: row.granted_at } : null;
}
export async function requireConsent(env: Env, user: string, generation: number) {
  const c = await consent(env,user);
  if (!c?.active || c.version !== CONSENT_VERSION || c.generation !== generation) throw new HttpError(409, '分析への同意が変更されました。自動送信を停止しました。');
}
export async function changeConsent(env: Env, user: string, active: boolean) {
  await env.DB.prepare(`INSERT INTO participants(user_id,active,generation,version,granted_at) VALUES(?1,?2,1,?3,?4)
    ON CONFLICT(user_id) DO UPDATE SET active=?2,generation=CASE WHEN participants.active=?2 AND participants.version=?3 THEN participants.generation ELSE participants.generation+1 END,version=?3,granted_at=CASE WHEN participants.active=?2 AND participants.version=?3 THEN participants.granted_at ELSE ?4 END`).bind(user,active?1:0,CONSENT_VERSION,new Date().toISOString()).run();
  return consent(env,user);
}
export async function upload(env: Env, user: string, request: Request, id?: string, part?: string) {
  const now=Date.now();
  if (!id) {
    const s=summarySchema.parse(await readJson(request)), body=JSON.stringify(s), hash=await digest(body);
    await requireConsent(env,user,s.consentGeneration);
    if (s.consentVersion !== CONSENT_VERSION || Date.parse(s.startedAt)>now+300_000 || Date.parse(s.endedAt)>now+300_000) throw new HttpError(400,'測定日時または同意の版が正しくありません。');
    const receipt=await env.DB.prepare('SELECT erased,expires_at FROM measurement_receipts WHERE user_id=? AND measurement_id=?').bind(user,s.measurementId).first<{erased:number;expires_at:number}>();
    if (receipt && (receipt.erased || receipt.expires_at<=now)) throw new HttpError(410,'削除・期限切れの測定は再送信できません。');
    const prior=await env.DB.prepare('SELECT * FROM measurements WHERE user_id=? AND id=?').bind(user,s.measurementId).first<Row>();
    if(prior) {
      const old=summarySchema.parse(JSON.parse(prior.summary));
      if(content(old)!==content(s))throw new HttpError(409,'同じ測定IDに異なる内容があります。');
      if(prior.completed_at)return json({complete:true,receivedAt:prior.received_at,expiresAt:prior.expires_at});
    }
    if(prior && prior.generation!==s.consentGeneration) {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO deletion_jobs(id,user_id,prefix,created_at,through_generation) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),user,`${user}/${prior.generation}/${s.measurementId}/`,now,prior.generation),
        env.DB.prepare('DELETE FROM measurements WHERE user_id=? AND id=? AND generation=? AND completed_at IS NULL').bind(user,s.measurementId,prior.generation),
      ]);
    }
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO measurement_receipts(user_id,measurement_id,first_received,expires_at,erased) VALUES(?1,?2,?3,?4,0)').bind(user,s.measurementId,now,expiresAfter24Months(now)),
      env.DB.prepare(`INSERT OR IGNORE INTO measurements(user_id,id,generation,summary,digest,received_at,expires_at)
        SELECT ?1,?2,?3,?4,?5,r.first_received,r.expires_at FROM measurement_receipts r JOIN participants p ON p.user_id=r.user_id
        WHERE r.user_id=?1 AND r.measurement_id=?2 AND r.erased=0 AND r.expires_at>?6 AND p.active=1 AND p.generation=?3`).bind(user,s.measurementId,s.consentGeneration,body,hash,now),
    ]);
    const row=await measurement(env,user,s.measurementId,s.consentGeneration);
    // A manual retry may follow an automatic attempt in the same consent generation.
    // Preserve the first receipt and collection mode; only identical measurement data is reusable.
    if (row.digest!==hash && content(summarySchema.parse(JSON.parse(row.summary)))!==content(s)) throw new HttpError(409,'同じ測定IDに異なる内容があります。');
    return json({ receivedAt: row.received_at, expiresAt: row.expires_at, complete: !!row.completed_at });
  }
  const generation=Number(new URL(request.url).searchParams.get('generation'));
  if (!Number.isSafeInteger(generation)||generation<1) throw new HttpError(400,'Missing generation');
  await requireConsent(env,user,generation);
  const row=await measurement(env,user,id,generation), summary=summarySchema.parse(JSON.parse(row.summary));
  if(row.expires_at<=now) throw new HttpError(410,'保存期限を過ぎました。');
  if(part==='complete') {
    if(row.completed_at) return json({complete:true});
    const rows=await env.DB.prepare('SELECT number,object_key FROM chunks WHERE user_id=? AND measurement_id=? AND generation=? ORDER BY number').bind(user,id,generation).all<{number:number;object_key:string}>();
    if(rows.results.length!==summary.chunkCount) throw new HttpError(409,'未送信のデータがあります。');
    let samples=0,events=0,lastSequence=-1,lastElapsed=-1;
    for(let i=0;i<rows.results.length;i++) {
      const chunk=rows.results[i]; if(chunk.number!==i) throw new HttpError(409,'Missing chunk');
      const object=await env.TELEMETRY.get(chunk.object_key); if(!object) throw new HttpError(409,'Missing object');
      const data=chunkSchema.parse(await new Response(object.body.pipeThrough(new DecompressionStream('gzip'))).json());
      checkChunk(data,summary);
      for(const sample of data.samples) { if(sample.sequence<=lastSequence||sample.elapsedMs<lastElapsed) throw new HttpError(409,'測定サンプルの順番が正しくありません。'); lastSequence=sample.sequence;lastElapsed=sample.elapsedMs; }
      samples+=data.samples.length;events+=data.events.length;
    }
    if(samples!==summary.sampleCount||events!==summary.eventCount) throw new HttpError(409,'測定件数が一致しません。');
    const result=await env.DB.prepare('UPDATE measurements SET completed_at=COALESCE(completed_at,?1) WHERE user_id=?2 AND id=?3 AND generation=?4 AND EXISTS(SELECT 1 FROM participants WHERE user_id=?2 AND active=1 AND generation=?4)').bind(now,user,id,generation).run();
    if(!result.meta.changes) throw new HttpError(409,'同意が変更されました。');
    return json({complete:true});
  }
  const chunk=chunkSchema.parse(await readJson(request));
  if(String(chunk.index)!==part||chunk.index>=summary.chunkCount) throw new HttpError(400,'Invalid chunk number');
  checkChunk(chunk,summary);
  const body=JSON.stringify(chunk),hash=await digest(body);
  const existing=await env.DB.prepare('SELECT digest FROM chunks WHERE user_id=? AND measurement_id=? AND generation=? AND number=?').bind(user,id,generation,chunk.index).first<{digest:string}>();
  if(existing) { if(existing.digest!==hash) throw new HttpError(409,'分割データの内容が競合しています。'); return json({received:true}); }
  if(row.completed_at) throw new HttpError(409,'Completed measurement is immutable');
  const key=`${user}/${generation}/${id}/${chunk.index}-${hash}.json.gz`;
  const bytes=await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  await env.TELEMETRY.put(key,bytes,{httpMetadata:{contentType:'application/json',contentEncoding:'gzip'}});
  // Authorization is checked again in the same D1 statement that records the object.
  await env.DB.prepare(`INSERT OR IGNORE INTO chunks(user_id,measurement_id,generation,number,digest,object_key,samples,events)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8 FROM measurements m JOIN participants p ON p.user_id=m.user_id
    WHERE m.user_id=?1 AND m.id=?2 AND m.generation=?3 AND m.completed_at IS NULL AND p.active=1 AND p.generation=?3`)
    .bind(user,id,generation,chunk.index,hash,key,chunk.samples.length,chunk.events.length).run();
  const saved=await env.DB.prepare('SELECT digest FROM chunks WHERE user_id=? AND measurement_id=? AND generation=? AND number=?').bind(user,id,generation,chunk.index).first<{digest:string}>();
  if(!saved||saved.digest!==hash) { await env.TELEMETRY.delete(key); throw new HttpError(409,'同意が変更されたか、分割データが競合しています。'); }
  return json({received:true});
}
async function measurement(env:Env,user:string,id:string,generation:number):Promise<Row> {
  const row=await env.DB.prepare('SELECT * FROM measurements WHERE user_id=? AND id=? AND generation=?').bind(user,id,generation).first<Row>();
  if(!row) throw new HttpError(409,'測定の送信を最初から再試行してください。'); return row;
}
function checkChunk(chunk:MeasurementChunk,summary:MeasurementSummary) {
  const ids=new Set(summary.calibrations.map(c=>c.id));
  if(chunk.samples.some(s=>s.elapsedMs>summary.elapsedMs||s.focusMs>summary.focusMs||!ids.has(s.calibrationId))||chunk.events.some(e=>e.elapsedMs>summary.elapsedMs||e.focusMs>summary.focusMs)) throw new HttpError(400,'測定の範囲に一致しないデータです。');
}
export async function eraseAnalysis(env:Env,user:string,accountDeleted=false) {
  // A separate R2 ledger survives a D1 point-in-time restore. It contains no samples.
  const deletedAt=Date.now();
  await env.TELEMETRY.put(`deletions/${user}/${deletedAt}.json`,JSON.stringify({userId:user,deletedAt,accountDeleted}),{httpMetadata:{contentType:'application/json'}});
  await env.DB.batch([
    env.DB.prepare('UPDATE participants SET active=0,generation=generation+1 WHERE user_id=?').bind(user),
    env.DB.prepare('UPDATE measurement_receipts SET erased=1 WHERE user_id=?').bind(user),
    env.DB.prepare('INSERT INTO deletion_jobs(id,user_id,prefix,created_at,through_generation) SELECT ?1,?2,?3,?4,generation-1 FROM participants WHERE user_id=?2').bind(crypto.randomUUID(),user,`${user}/`,Date.now()),
    env.DB.prepare('INSERT INTO deletion_tombstones(user_id,deleted_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET deleted_at=excluded.deleted_at').bind(user,Date.now()),
    env.DB.prepare('DELETE FROM measurements WHERE user_id=?').bind(user),
    env.DB.prepare('DELETE FROM profile_snapshots WHERE user_id=?').bind(user),
  ]);
}
