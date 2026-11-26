import { betterAuth } from 'better-auth/minimal';
import type { BetterAuthOptions } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import { decryptOAuthToken } from 'better-auth/oauth2';
import * as schema from './schema';
import type { Env } from './env';
import { HttpError } from './http';
import { sendAuthMail } from './mail';

export { CONSENT_VERSION } from '../shared/account';
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
export async function appleSecret(env: Env) {
  if (!env.APPLE_PRIVATE_KEY || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_CLIENT_ID) return undefined;
  const pem = env.APPLE_PRIVATE_KEY.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now()/1000);
  const encoded = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const body = `${encoded({ alg: 'ES256', kid: env.APPLE_KEY_ID })}.${encoded({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 3600, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID })}`;
  return `${body}.${base64url(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body))))}`;
}
export async function createAuth(env: Env, onMailError?: (error: unknown) => void) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new HttpError(503, 'ログインの準備中です。ログインせずに利用できます。');
  const apple = await appleSecret(env);
  // Better Auth logs and suppresses mail callback failures. Preserve the outcome
  // in this request only so our HTTP boundary cannot report a successful send.
  const deliver=async(email:string,url:string,kind:'verify'|'reset')=>{
    try{await sendAuthMail(env,email,url,kind);}catch(error){onMailError?.(error);throw error;}
  };
  const options: BetterAuthOptions = {
    logger: {disabled:true},
    appName: 'PiiiN', baseURL: env.APP_ORIGIN, secret: env.BETTER_AUTH_SECRET,
    // Expired state no longer contains the per-request errorCallbackURL.
    onAPIError: { errorURL: `${env.APP_ORIGIN}/login?error=oauth` },
    // Apple returns the authorization result using a cross-origin form POST.
    trustedOrigins: [env.APP_ORIGIN, ...(apple ? ['https://appleid.apple.com'] : [])],
    database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema, transaction: false }),
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } } : {}),
      ...(apple ? { apple: { clientId: env.APPLE_CLIENT_ID!, clientSecret: apple } } : {}),
    },
    emailAndPassword: {
      enabled: !!env.RESEND_API_KEY, requireEmailVerification: true, autoSignIn: false,
      minPasswordLength: 12, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({user,url}) => {
        const credential=await env.DB.prepare("SELECT id FROM account WHERE userId=? AND providerId='credential' AND password IS NOT NULL").bind(user.id).first();
        if(credential)await deliver(user.email,url,'reset');
      },
    },
    emailVerification: {sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:false,
      sendVerificationEmail:async ({user,url})=>{await deliver(user.email,url,'verify');}},
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true } },
    session: { expiresIn: 30 * 86400, updateAge: 86400, freshAge: 300, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: new URL(env.APP_ORIGIN).protocol === 'https:' },
    plugins: [bearer()],
    // The public Worker applies a D1-backed rate limit across instances.
    rateLimit: { enabled: false },
  };
  return betterAuth(options);
}
export type Auth = Awaited<ReturnType<typeof createAuth>>;
export async function identity(auth: Auth, request: Request, fresh = false) {
  const value = await auth.api.getSession({ headers: request.headers });
  if (!value) throw new HttpError(401, 'ログインし直すと、同じアカウントの送信を再開できます。');
  const expected = request.headers.get('X-Piiin-Account');
  if (expected && expected !== value.user.id) throw new HttpError(409, 'アカウントが変わりました。記録は送信していません。');
  if (fresh && Date.now() - value.session.createdAt.getTime() > 300_000) throw new HttpError(403, 'この操作の前に再ログインしてください。');
  return value;
}
export async function revokeApple(env: Env, auth: Auth, userId: string) {
  const rows = await env.DB.prepare("SELECT refreshToken,accessToken FROM account WHERE userId=? AND providerId='apple'").bind(userId).all<{refreshToken: string|null; accessToken: string|null}>();
  for (const row of rows.results) {
    const encrypted = row.refreshToken || row.accessToken;
    if (!encrypted) continue;
    const token = await decryptOAuthToken(encrypted, await auth.$context);
    const secret = await appleSecret(env); if (!secret) throw new HttpError(503, 'Apple連携の解除を準備できませんでした。');
    const response = await fetch('https://appleid.apple.com/auth/revoke', { method: 'POST', body: new URLSearchParams({ client_id: env.APPLE_CLIENT_ID!, client_secret: secret, token, token_type_hint: row.refreshToken ? 'refresh_token' : 'access_token' }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new HttpError(503, 'Apple連携を解除できませんでした。再試行してください。');
  }
}
