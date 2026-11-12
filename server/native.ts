import { z } from 'zod';
import type { Env } from './env';
import type { Auth } from './auth';
import { digest, HttpError, json, readJson } from './http';

export async function nativeHandoff(env:Env,auth:Auth,request:Request,action:string,userId?:string) {
  const now=Date.now();
  if(action==='create') {
    const {challenge}=z.object({challenge:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await readJson(request));
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO native_handoffs(id,challenge,expires_at) VALUES(?,?,?)').bind(id,challenge,now+300_000).run();
    return json({id,url:`${env.APP_ORIGIN}/account/native?handoff=${id}`,expiresAt:now+300_000});
  }
  if(action==='approve') {
    const {id}=z.object({id:z.string().uuid()}).strict().parse(await readJson(request));
    if(!userId) throw new HttpError(401,'Login required');
    const verified=await env.DB.prepare('SELECT id FROM user WHERE id=? AND emailVerified=1').bind(userId).first();
    if(!verified)throw new HttpError(403,'メールアドレスを確認してください。');
    const result=await env.DB.prepare('UPDATE native_handoffs SET user_id=? WHERE id=? AND expires_at>? AND user_id IS NULL').bind(userId,id,now).run();
    if(!result.meta.changes) throw new HttpError(410,'ログインの有効期限が切れました。アプリからやり直してください。');
    return json({approved:true});
  }
  if(action==='exchange') {
    const {id,verifier}=z.object({id:z.string().uuid(),verifier:z.string().min(43).max(128).regex(/^[a-zA-Z0-9_-]+$/)}).strict().parse(await readJson(request));
    const challenge=await digest(verifier);
    const row=await env.DB.prepare('DELETE FROM native_handoffs WHERE id=? AND challenge=? AND expires_at>? AND user_id IS NOT NULL RETURNING user_id').bind(id,challenge,now).first<{user_id:string}>();
    if(!row) {
      const pending=await env.DB.prepare('SELECT id FROM native_handoffs WHERE id=? AND challenge=? AND expires_at>? AND user_id IS NULL').bind(id,challenge,now).first();
      if(pending) return json({pending:true},202);
      throw new HttpError(410,'ログインをもう一度開始してください。');
    }
    const session=await (await auth.$context).internalAdapter.createSession(row.user_id);
    return json({token:session.token,userId:row.user_id});
  }
  throw new HttpError(404,'Not found');
}
