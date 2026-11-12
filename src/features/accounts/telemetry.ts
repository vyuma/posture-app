import type { Session } from '../work/model';
import { CHUNK_SIZE, summarySchema, chunkSchema, type MeasurementSummary, type MeasurementChunk } from '../../../shared/telemetry';
import type { AnalysisTicket } from './types';

export function measurementUpload(session: Session, ticket: AnalysisTicket): { summary: MeasurementSummary; chunks: MeasurementChunk[] } {
  if (!session.endedAt || !['completed', 'interrupted'].includes(session.status)) throw new Error('終了した測定だけを送信できます。');
  const count = Math.max(1, Math.ceil(session.samples.length / CHUNK_SIZE), Math.ceil(session.events.length / CHUNK_SIZE));
  const summary = summarySchema.parse({ schemaVersion: 1, measurementId: session.id, installationId: ticket.installationId,
    startedAt: session.startedAt, endedAt: session.endedAt, timeZone: ticket.timeZone, platform: ticket.platform, channel: ticket.channel,
    appVersion: ticket.appVersion, status: session.status, mode: ticket.mode, metadataBasis:ticket.metadataBasis??'recorded', consentVersion: ticket.consent.version, consentGeneration: ticket.consent.generation,
    focusMs: session.focusMs, validMs: session.validMs, goodMs: session.goodMs, elapsedMs: session.elapsedMs,
    ratioBasis: session.legacy ? 'legacy' : session.ratioBasis ?? 'valid-v1', legacyGoodRatio: session.legacyGoodRatio ?? null,
    settings: { focusMinutes: session.settings.focusMinutes, restMinutes: session.settings.restMinutes, cycles: session.settings.cycles },
    calibrations: session.calibrations.map(c => ({ id: c.id, focusMs: c.focusMs, elapsedMs: c.elapsedMs, scoreVersion: c.scoreVersion })),
    sampleCount: session.samples.length, eventCount: session.events.length, chunkCount: count,
  });
  const chunks = Array.from({ length: count }, (_, index) => chunkSchema.parse({ index,
    samples: session.samples.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE).map(s => ({ sequence: s.sequence, focusMs: s.focusMs, elapsedMs: s.elapsedMs, calibrationId: s.calibrationId, segment: s.segment, score: s.score, deviation: s.deviation, state: s.state })),
    events: session.events.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE).map(e => ({ kind: e.kind, focusMs: e.focusMs, elapsedMs: e.elapsedMs, segment: e.segment })),
  }));
  return { summary, chunks };
}
