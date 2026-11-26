import { z } from 'zod';

const id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9:_-]+$/);
const ms = z.number().finite().min(0).max(7 * 24 * 3600_000);
export const sampleSchema = z.object({ sequence: z.number().int().nonnegative(), focusMs: ms, elapsedMs: ms,
  calibrationId: z.string().max(200), segment: z.number().int().nonnegative(),
  score: z.number().finite().min(0).max(100).nullable(), deviation: z.number().finite().min(0).max(100000).nullable(),
  state: z.enum(['good', 'bad', 'untracked']),
}).strict().refine(s => s.state !== 'untracked' || (s.score === null && s.deviation === null), 'Untracked samples must not invent a score');
export const eventSchema = z.object({ kind: z.enum(['start','rest','focus','pause','resume','recalibrate','calibrated','calibration_cancelled','tracking_lost','tracking_restored','finish']), focusMs: ms, elapsedMs: ms, segment: z.number().int().nonnegative() }).strict();
export const summarySchema = z.object({
  schemaVersion: z.literal(1), measurementId: id, installationId: z.string().uuid(),
  startedAt: z.iso.datetime({ offset: true }), endedAt: z.iso.datetime({ offset: true }), timeZone: z.string().min(1).max(100),
  platform: z.enum(['web','macos','windows']), channel: z.enum(['web','direct','mac-app-store','microsoft-store']), appVersion: z.string().min(1).max(60),
  status: z.enum(['completed','interrupted']), mode: z.enum(['automatic','manual']),
  metadataBasis: z.enum(['recorded','reconstructed']),
  consentVersion: z.string().min(1).max(80), consentGeneration: z.number().int().nonnegative(),
  focusMs: ms, validMs: ms, goodMs: ms, elapsedMs: ms,
  ratioBasis: z.enum(['focus-v1','valid-v1','legacy']), legacyGoodRatio: z.number().finite().min(0).max(1).nullable(),
  settings: z.object({ focusMinutes: z.number().int().min(1).max(120), restMinutes: z.number().int().min(0).max(60), cycles: z.number().int().min(1).max(12) }).strict(),
  calibrations: z.array(z.object({ id: z.string().max(200), focusMs: ms, elapsedMs: ms, scoreVersion: z.string().min(1).max(120) }).strict()).max(2000),
  sampleCount: z.number().int().min(0).max(200000), eventCount: z.number().int().min(0).max(20000),
  chunkCount: z.number().int().min(1).max(1000),
}).strict().superRefine((s, ctx) => {
  if (s.goodMs > s.validMs || s.validMs > s.focusMs || s.focusMs > s.elapsedMs) ctx.addIssue({ code: 'custom', message: 'Invalid duration ordering' });
  if (Date.parse(s.endedAt) < Date.parse(s.startedAt)) ctx.addIssue({ code: 'custom', message: 'Invalid measurement dates' });
  if (s.mode === 'automatic' && s.ratioBasis === 'legacy') ctx.addIssue({ code: 'custom', message: 'Legacy data requires manual consent' });
});
export const chunkSchema = z.object({ index: z.number().int().min(0).max(999), samples: z.array(sampleSchema).max(300), events: z.array(eventSchema).max(300) }).strict();
export type MeasurementSummary = z.infer<typeof summarySchema>;
export type MeasurementChunk = z.infer<typeof chunkSchema>;
export const CHUNK_SIZE = 300;
export function expiresAfter24Months(receivedAt: number): number {
  const date = new Date(receivedAt), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 24);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return date.getTime();
}
