import { ensureProfile } from './survey';
import type { Env } from './env';
import { digest, HttpError, json } from './http';
import { chunkSchema, summarySchema, type MeasurementSummary } from '../shared/telemetry';

export async function requireOperator(env:Env,request:Request) {
  if(!env.EXPORT_TOKEN || await digest(request.headers.get('Authorization')??'')!==await digest(`Bearer ${env.EXPORT_TOKEN}`)) throw new HttpError(401,'Unauthorized');
}
const coverage='Only received records are known. Missing local records and offline intervals cannot be inferred.';
function ratios(s:MeasurementSummary) {
  const denominator=s.ratioBasis==='focus-v1'?s.focusMs:s.validMs;
  return {
    appGoodRatio:s.ratioBasis==='legacy'?s.legacyGoodRatio:s.validMs>0&&denominator>0?s.goodMs/denominator:null,
    observableRatio:s.focusMs?s.validMs/s.focusMs:null,
    goodObservedRatio:s.validMs?s.goodMs/s.validMs:null,
  };
}
function output(records:Record<string,unknown>[],nextCursor:number|null,format:string,columns:string[]) {
  if(format==='json')return json({records,nextCursor,coverage});
  const cell=(value:unknown)=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
  const csv=[columns.join(','),...records.map(r=>columns.map(c=>cell(r[c])).join(','))].join('\r\n');
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="piiin-analysis.csv"',...(nextCursor?{'X-Next-Cursor':String(nextCursor)}:{})}});
}
export async function exportMeasurements(env:Env,request:Request) {
  await requireOperator(env,request);
  const q=new URL(request.url).searchParams,from=q.get('from'),to=q.get('to'),user=q.get('user'),platform=q.get('platform');
  const cursor=Number(q.get('cursor')??0),view=q.get('view')??'summaries',format=q.get('format')??'json';
  if(!Number.isSafeInteger(cursor)||cursor<0||[from,to].some(d=>d&&!Number.isFinite(Date.parse(d)))||!['summaries','profiles','series'].includes(view)||!['json','csv'].includes(format))throw new HttpError(400,'Invalid filter');
  const version=q.get('version')??'1';
  if(!['1','2'].includes(version))throw new HttpError(400,'Invalid export version');
  if(version==='2'&&view==='profiles') {
    const rows=await env.DB.prepare(`SELECT r.rowid AS cursor,p.analysis_id AS analysisId,r.observed_at AS observedAt,r.expires_at AS expiresAt,r.sex_at_birth AS sexAtBirth,r.age_years AS ageYears,r.sex_source AS sexSource,r.age_source AS ageSource,r.language,r.skipped FROM survey_responses r JOIN analysis_profiles p ON p.user_id=r.user_id WHERE r.rowid>? AND r.expires_at>? AND (? IS NULL OR p.analysis_id=?) AND (? IS NULL OR r.observed_at>=?) AND (? IS NULL OR r.observed_at<?) ORDER BY r.rowid LIMIT 250`).bind(cursor,Date.now(),user,user,from,from?Date.parse(from):null,to,to?Date.parse(to):null).all<Record<string,unknown>&{cursor:number}>();
    const records=rows.results.map(r=>({exportVersion:2,...r}));
    return output(records,rows.results.length===250?rows.results.at(-1)!.cursor:null,format,['exportVersion','analysisId','observedAt','expiresAt','sexAtBirth','ageYears','sexSource','ageSource','language','skipped']);
  }
  if(view==='profiles') {
    if(format==='csv')throw new HttpError(400,'Profile history export uses JSON.');
    const rows=await env.DB.prepare('SELECT rowid AS cursor,user_id AS analysisId,observed_at AS observedAt,expires_at AS expiresAt,gender,age_years AS ageYears,residence_country AS residenceCountry,source FROM profile_snapshots WHERE rowid>? AND expires_at>? AND (? IS NULL OR user_id=?) AND (? IS NULL OR observed_at>=?) AND (? IS NULL OR observed_at<?) ORDER BY rowid LIMIT 250')
      .bind(cursor,Date.now(),user,user,from,from?Date.parse(from):null,to,to?Date.parse(to):null).all<{cursor:number}>();
    return json({records:rows.results,nextCursor:rows.results.length===250?rows.results.at(-1)!.cursor:null});
  }
  // Each series page loads at most ten bounded chunks (300 samples + 300 events each).
  const series=view==='series',limit=series?10:250;
  const select=series?'c.rowid AS cursor,c.number,c.object_key,m.*':'m.rowid AS cursor,m.*';
  const join=series?'JOIN chunks c ON c.user_id=m.user_id AND c.measurement_id=m.id AND c.generation=m.generation':'';
  const rowid=series?'c.rowid':'m.rowid';
  const selectedUser=version==='2'&&user?(await env.DB.prepare('SELECT user_id FROM analysis_profiles WHERE analysis_id=?').bind(user).first<{user_id:string}>())?.user_id??'__unknown__':user;
  const rows=await env.DB.prepare(`SELECT ${select} FROM measurements m ${join} WHERE ${rowid}>? AND m.expires_at>? AND (? IS NULL OR m.user_id=?)
    AND (? IS NULL OR json_extract(m.summary,'$.startedAt')>=?) AND (? IS NULL OR json_extract(m.summary,'$.startedAt')<?)
    AND (? IS NULL OR json_extract(m.summary,'$.platform')=?) ORDER BY ${rowid} LIMIT ?`)
    .bind(cursor,Date.now(),selectedUser,selectedUser,from,from?new Date(from).toISOString():null,to,to?new Date(to).toISOString():null,platform,platform,limit)
    .all<{cursor:number;user_id:string;id:string;summary:string;received_at:number;expires_at:number;completed_at:number|null;number?:number;object_key?:string}>();
  const records:Record<string,unknown>[]=[];
  const ids=new Map<string,string>();
  for(const row of rows.results) {
    if(version==='2'&&!ids.has(row.user_id)){await ensureProfile(env,row.user_id);const id=await env.DB.prepare('SELECT analysis_id FROM analysis_profiles WHERE user_id=?').bind(row.user_id).first<{analysis_id:string}>();ids.set(row.user_id,id!.analysis_id);}
    const s=summarySchema.parse(JSON.parse(row.summary));
    const metadata={...(version==='2'?{exportVersion:2}:{}),analysisId:version==='2'?ids.get(row.user_id):row.user_id,measurementId:s.measurementId,complete:!!row.completed_at,startedAt:s.startedAt,platform:s.platform,channel:s.channel,mode:s.mode,schemaVersion:s.schemaVersion,metadataBasis:s.metadataBasis};
    if(series) {
      const object=await env.TELEMETRY.get(row.object_key!);
      if(!object)throw new HttpError(409,'A stored chunk is unavailable; retry the export.');
      const chunk=chunkSchema.parse(await new Response(object.body.pipeThrough(new DecompressionStream('gzip'))).json());
      const versions=new Map(s.calibrations.map(c=>[c.id,c.scoreVersion]));
      for(const sample of chunk.samples)records.push({...metadata,chunk:row.number,recordType:'sample',...sample,scoreVersion:versions.get(sample.calibrationId)});
      chunk.events.forEach((event,index)=>records.push({...metadata,chunk:row.number,recordType:'event',eventIndex:index,...event}));
    } else {
      records.push({...s,...metadata,firstReceivedAt:new Date(row.received_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),...ratios(s),
        scoreVersions:[...new Set(s.calibrations.map(c=>c.scoreVersion))].join('|'),calibrationCount:s.calibrations.length});
    }
  }
  const nextCursor=rows.results.length===limit?rows.results.at(-1)!.cursor:null;
  const columns=series
    ?['analysisId','measurementId','complete','startedAt','platform','channel','mode','metadataBasis','schemaVersion','chunk','recordType','sequence','eventIndex','focusMs','elapsedMs','calibrationId','segment','score','deviation','state','kind','scoreVersion']
    :['analysisId','measurementId','complete','startedAt','endedAt','timeZone','platform','channel','appVersion','installationId','mode','metadataBasis','status','focusMs','validMs','goodMs','elapsedMs','ratioBasis','appGoodRatio','observableRatio','goodObservedRatio','sampleCount','eventCount','chunkCount','schemaVersion','scoreVersions','calibrationCount','consentVersion','consentGeneration','firstReceivedAt','expiresAt'];
  return output(records,nextCursor,format,version==='2'?['exportVersion',...columns]:columns);
}
