export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function readJson(request: Request, limit = 512 * 1024): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'JSON required');
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) throw new HttpError(413, 'Request too large');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'Missing request');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Request too large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Invalid JSON'); }
}
export async function digest(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2,'0')).join(''); }
export async function rateLimit(db: D1Database, key: string, maximum: number, now = Date.now()) {
  const window = Math.floor(now / 60_000), bucket = `${key}:${window}`;
  const result = await db.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?1,1,?2) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, now + 120_000).first<{ count: number }>();
  if (!result || result.count > maximum) throw new HttpError(429, 'しばらく待ってから再試行してください。');
}
