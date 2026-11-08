import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let mf,db,bucket,temp,options;
const origin='https://test.piiin.invalid';
const tokens={alice:'test-alice-session-token-0123456789',bob:'test-bob-session-token-0123456789'};
const makeSummary=(id,generation=1)=>({schemaVersion:1,measurementId:id,installationId:'f3d371d2-7ce5-40ef-9d22-427e8b3966e8',startedAt:'2026-01-01T00:00:00Z',endedAt:'2026-01-01T00:00:02Z',timeZone:'Asia/Tokyo',platform:'web',channel:'web',appVersion:'0.1.9',status:'completed',mode:'automatic',metadataBasis:'recorded',consentVersion:'2026-11-08-v1',consentGeneration:generation,focusMs:2000,validMs:1000,goodMs:1000,elapsedMs:2000,ratioBasis:'focus-v1',legacyGoodRatio:null,settings:{focusMinutes:1,restMinutes:0,cycles:1},calibrations:[{id:'baseline-1',focusMs:0,elapsedMs:0,scoreVersion:'test-v1'}],sampleCount:2,eventCount:1,chunkCount:1});
const chunk={index:0,samples:[{sequence:0,focusMs:1000,elapsedMs:1000,calibrationId:'baseline-1',segment:0,score:100,deviation:0,state:'good'},{sequence:1,focusMs:2000,elapsedMs:2000,calibrationId:'baseline-1',segment:0,score:null,deviation:null,state:'untracked'}],events:[{kind:'finish',focusMs:2000,elapsedMs:2000,segment:0}]};
const call=(path,method='GET',body,user='alice',headers={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,...(user?{Authorization:`Bearer ${tokens[user]}`,'X-Piiin-Account':user}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
async function ok(response,status=200){const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
before(async()=>{
  temp=await mkdtemp(join(tmpdir(),'piiin-worker-test-'));
  const output=join(temp,'worker.mjs');
  await build({entryPoints:['server/worker.ts'],outfile:output,bundle:true,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent'});
  options={modules:true,unsafeTriggerHandlers:true,script:await readFile(output,'utf8'),compatibilityDate:'2026-11-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['TELEMETRY'],bindings:{APP_ORIGIN:origin,BETTER_AUTH_SECRET:'local-test-secret-not-for-production-12345678',EXPORT_TOKEN:'local-export-test-token',GOOGLE_CLIENT_ID:'test-client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-google-secret'},serviceBindings:{ASSETS:()=>new Response('asset')}};
  mf=new Miniflare(convertV4MiniflareOptions(options));
  db=await mf.getD1Database('DB');bucket=await mf.getR2Bucket('TELEMETRY');
  for(const sql of (await readFile('server/migrations/0001_accounts.sql','utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  for(const user of Object.keys(tokens)) {
    const now=Date.now();
    await db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(user,user,`${user}@example.invalid`,now,now).run();
    await db.prepare('INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(`session-${user}`,tokens[user],user,now+3600_000,now,now).run();
  }
});
after(async()=>{await mf?.dispose();if(temp)await rm(temp,{recursive:true,force:true});});
test('Google authorization uses the deployment callback, safe cookies and only basic scopes',async()=>{
  const response=await call('/api/auth/sign-in/social','POST',{provider:'google',callbackURL:origin+'/app',disableRedirect:true},null);
  const result=await ok(response);
  const redirect=new URL(result.url);
  assert.equal(redirect.origin,'https://accounts.google.com');
  assert.equal(redirect.searchParams.get('redirect_uri'),origin+'/api/auth/callback/google');
  assert.equal(redirect.searchParams.get('client_id'),'test-client.apps.googleusercontent.com');
  assert.ok(redirect.searchParams.get('state'));
  assert.deepEqual(new Set(redirect.searchParams.get('scope').split(' ')),new Set(['openid','email','profile']));
  const cookies=response.headers.getSetCookie().join(';');
  assert.match(cookies,/HttpOnly/i);assert.match(cookies,/Secure/i);assert.match(cookies,/SameSite=Lax/i);
  assert.equal(result.url.includes('test-google-secret'),false);
  assert.equal((await db.prepare('SELECT count(*) n FROM participants').first()).n,0);
  await ok(await call('/api/auth/sign-in/social','POST',{provider:'google',callbackURL:'https://attacker.invalid/app',disableRedirect:true},null),403);
  await ok(await call('/api/auth/sign-in/social','POST',{provider:'google',scopes:['https://www.googleapis.com/auth/user.birthday.read'],disableRedirect:true},null),400);
});
test('auth requires consent; A cannot upload with B cookie or forged owner',async()=>{
  assert.equal((await ok(await call('/api/me'))).user.id,'alice');
  assert.equal((await ok(await call('/api/me','GET',undefined,null))).user,null);
  await ok(await call('/api/measurements','POST',makeSummary('before-consent')),409);
  await ok(await call('/api/consent','POST',{version:'2026-11-08-v1',agree:true}));
  await ok(await call('/api/measurements','POST',makeSummary('forged'),'bob',{'X-Piiin-Account':'alice'}),409);
  await ok(await call('/api/consent','POST',{version:'2026-11-08-v1',agree:true},'alice',{Origin:'https://attacker.invalid'}),403);
  await ok(await call('/api/measurements','POST',{...makeSummary('raw-leak'),landmarks:[1,2,3]}),400);
});
test('partial upload, retries, concurrent duplicate chunks, and immutable completion',async()=>{
  const summary=makeSummary('retry');
  const initial=await ok(await call('/api/measurements','POST',summary));
  const manual=await ok(await call('/api/measurements','POST',{...summary,mode:'manual'}));
  assert.equal(manual.receivedAt,initial.receivedAt);
  assert.equal(JSON.parse((await db.prepare("SELECT summary FROM measurements WHERE id='retry'").first()).summary).mode,'automatic');
  await ok(await call('/api/measurements','POST',{...summary,goodMs:0,mode:'manual'}),409);
  await ok(await call('/api/measurements/retry/complete?generation=1','POST',{}),409);
  const responses=await Promise.all([call('/api/measurements/retry/0?generation=1','POST',chunk),call('/api/measurements/retry/0?generation=1','POST',chunk)]);
  for(const r of responses)await ok(r);
  await ok(await call('/api/measurements/retry/0?generation=1','POST',{...chunk,samples:[{...chunk.samples[0],score:50},chunk.samples[1]]}),409);
  await ok(await call('/api/measurements/retry/complete?generation=1','POST',{}));
  const again=await ok(await call('/api/measurements','POST',summary));assert.equal(again.complete,true);assert.equal(again.expiresAt,initial.expiresAt);
  assert.equal((await bucket.list()).objects.length,1);
  assert.equal((await db.prepare("SELECT count(*) n FROM measurements WHERE id='retry'").first()).n,1);
  const exportData=await ok(await call('/api/operator/export','GET',undefined,null,{Authorization:'Bearer local-export-test-token'}));
  assert.equal(exportData.records[0].appGoodRatio,0.5);assert.equal(exportData.records[0].observableRatio,0.5);assert.equal(exportData.records[0].complete,true);
  assert.equal(JSON.stringify(exportData).includes('@example.invalid'),false);
  const series=await ok(await call('/api/operator/export?view=series&user=alice&platform=web','GET',undefined,null,{Authorization:'Bearer local-export-test-token'}));
  assert.equal(series.records.length,3);assert.equal(series.records[1].state,'untracked');assert.equal(series.records[1].score,null);
  assert.equal(series.records[0].scoreVersion,'test-v1');assert.equal(series.records[2].kind,'finish');
  const filtered=await ok(await call('/api/operator/export?view=series&user=bob','GET',undefined,null,{Authorization:'Bearer local-export-test-token'}));assert.equal(filtered.records.length,0);
  const csv=await call('/api/operator/export?view=series&format=csv','GET',undefined,null,{Authorization:'Bearer local-export-test-token'});assert.equal(csv.status,200);assert.match(await csv.text(),/"untracked"/);
});
test('zero observation exports null ratios and partial uploads remain explicitly incomplete',async()=>{
  await ok(await call('/api/measurements','POST',{...makeSummary('unobserved'),validMs:0,goodMs:0}));
  const exported=await ok(await call('/api/operator/export','GET',undefined,null,{Authorization:'Bearer local-export-test-token'}));
  const row=exported.records.find(r=>r.measurementId==='unobserved');
  assert.equal(row.complete,false);assert.equal(row.appGoodRatio,null);assert.equal(row.goodObservedRatio,null);assert.equal(row.observableRatio,0);
});
test('revocation invalidates queued generations; manual resend never duplicates completed records',async()=>{
  await ok(await call('/api/consent','DELETE'));
  await ok(await call('/api/measurements','POST',makeSummary('stopped')),409);
  const {consent}=await ok(await call('/api/consent','POST',{version:'2026-11-08-v1',agree:true}));assert.equal(consent.generation,3);
  const complete=await ok(await call('/api/measurements','POST',{...makeSummary('retry',3),mode:'manual'}));assert.equal(complete.complete,true);
  assert.equal((await db.prepare("SELECT count(*) n FROM measurements WHERE id='retry'").first()).n,1);
});
test('retention deadline cannot be extended and deleted IDs cannot resurrect',async()=>{
  await ok(await call('/api/measurements','POST',makeSummary('expired',3)));
  await db.prepare("UPDATE measurement_receipts SET expires_at=? WHERE measurement_id='expired'").bind(Date.now()-1).run();
  await ok(await call('/api/measurements','POST',makeSummary('expired',3)),410);
  await ok(await call('/api/analysis','DELETE'));
  const {consent}=await ok(await call('/api/consent','POST',{version:'2026-11-08-v1',agree:true}));
  await ok(await call('/api/measurements','POST',{...makeSummary('retry',consent.generation),mode:'manual'}),410);
  assert.equal((await db.prepare('SELECT count(*) n FROM measurements').first()).n,0);
});
test('native handoff proves verifier and consumes approval once',async()=>{
  const verifier='valid-native-verifier-with-at-least-forty-three-characters';
  const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('hex');
  const {id}=await ok(await call('/api/native/create','POST',{challenge},null));
  await ok(await call('/api/native/exchange','POST',{id,verifier},null),202);
  await ok(await call('/api/native/approve','POST',{id}));
  await ok(await call('/api/native/exchange','POST',{id,verifier:'wrong-native-verifier-with-at-least-forty-three-characters'},null),410);
  const result=await ok(await call('/api/native/exchange','POST',{id,verifier},null));assert.equal(result.userId,'alice');assert.ok(result.token);
  await ok(await call('/api/native/exchange','POST',{id,verifier},null),410);
});
test('scheduled expiry removes detailed objects and profile history without deleting new consent generations',async()=>{
  const participation=(await ok(await call('/api/me'))).consent;
  await ok(await call('/api/measurements','POST',makeSummary('cron-expiry',participation.generation)));
  await ok(await call(`/api/measurements/cron-expiry/0?generation=${participation.generation}`,'POST',chunk));
  await ok(await call('/api/measurements','POST',makeSummary('keep-new-generation',participation.generation)));
  await ok(await call(`/api/measurements/keep-new-generation/0?generation=${participation.generation}`,'POST',chunk));
  await db.prepare("UPDATE measurements SET expires_at=? WHERE id='cron-expiry'").bind(Date.now()-1).run();
  await db.prepare('INSERT INTO profile_snapshots(id,user_id,observed_at,expires_at,source) VALUES(?,?,?,?,?)').bind('expired-profile','alice',1,2,'google-people').run();
  const response=await mf.dispatchFetch(origin+'/cdn-cgi/local/scheduled');assert.equal(response.status,200);
  assert.equal(await db.prepare("SELECT id FROM measurements WHERE id='cron-expiry'").first(),null);
  assert.equal(await db.prepare("SELECT id FROM profile_snapshots WHERE id='expired-profile'").first(),null);
  assert.equal((await bucket.list({prefix:`alice/${participation.generation}/cron-expiry/`})).objects.length,0);
  assert.equal((await bucket.list({prefix:`alice/${participation.generation}/keep-new-generation/`})).objects.length,1);
});
test('account deletion revokes all sessions while preserving deletion receipts',async()=>{
  await ok(await call('/api/account','DELETE'));
  assert.equal((await ok(await call('/api/me'))).user,null);
  assert.ok(await db.prepare("SELECT user_id FROM deletion_tombstones WHERE user_id='alice'").first());
  assert.equal((await ok(await call('/api/me','GET',undefined,'bob'))).user.id,'bob');
});
test('restoring D1 replays the independent deletion ledger before reopening APIs',async()=>{
  await ok(await call('/api/operator/reconcile','POST',{},null,{Authorization:'Bearer local-export-test-token'}),409);
  // Simulate a point-in-time database restore which resurrected a deleted identity/session.
  const now=Date.now();
  await db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind('alice','alice','alice@example.invalid',now-86400_000,now-86400_000).run();
  await db.prepare('INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind('restored-session',tokens.alice,'alice',now+3600_000,now-86400_000,now-86400_000).run();
  await mf.setOptions(convertV4MiniflareOptions({...options,bindings:{...options.bindings,RESTORE_LOCK:'true'}}));
  await ok(await call('/api/me'),503);
  await ok(await call('/api/operator/reconcile','POST',{},null),401);
  const result=await ok(await call('/api/operator/reconcile','POST',{},null,{Authorization:'Bearer local-export-test-token'}));assert.ok(result.reconciled>0);
  db=await mf.getD1Database('DB');
  assert.equal(await db.prepare("SELECT id FROM user WHERE id='alice'").first(),null);
  assert.equal(await db.prepare("SELECT id FROM session WHERE userId='alice'").first(),null);
  assert.ok(await db.prepare("SELECT id FROM user WHERE id='bob'").first());
});
