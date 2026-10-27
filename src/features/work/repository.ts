import { normalizeCharacterId } from '../characters/characterIds';
import { chooseReward, DEFAULT_TIMER, EMPTY_COLLECTION, normalizeTimer, type Card, type Collection, type Session, type TimerSettings } from './model';

export interface WorkDriver {
  collection(): Promise<Collection | null>;
  session(id: string): Promise<Session | null>;
  checkpoint(session: Session): Promise<void>;
  compareAndSet(revision: number | null, collection: Collection, session?: Session): Promise<boolean>;
  interrupted(): Promise<Session[]>;
}
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('保存が中断されました')); });
}
export async function openBrowserDriver(): Promise<WorkDriver> {
  const opening = indexedDB.open('piiin-work-v1', 1);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore('meta');
    db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('status', 'status');
  };
  const db = await request(opening);
  db.onversionchange = () => db.close();
  return {
    async collection() { return await request(db.transaction('meta').objectStore('meta').get('collection')) ?? null; },
    async session(id) { return await request(db.transaction('sessions').objectStore('sessions').get(id)) ?? null; },
    async checkpoint(session) {
      const tx = db.transaction('sessions', 'readwrite'); const done = transactionDone(tx); const store = tx.objectStore('sessions');
      const existing = await request<Session | undefined>(store.get(session.id));
      if (!existing || !['completed', 'interrupted'].includes(existing.status)) store.put(session);
      await done;
    },
    async compareAndSet(revision, collection, session) {
      const tx = db.transaction(['meta', 'sessions'], 'readwrite'); const done = transactionDone(tx);
      const meta = tx.objectStore('meta'); const current = await request<Collection | undefined>(meta.get('collection'));
      if ((current?.revision ?? null) !== revision) { await done; return false; }
      if (session) {
        const previous = await request<Session | undefined>(tx.objectStore('sessions').get(session.id));
        if (previous && ['completed', 'interrupted'].includes(previous.status)) { await done; return false; }
        tx.objectStore('sessions').put(session);
      }
      meta.put(collection, 'collection'); await done; return true;
    },
    async interrupted() {
      const index = db.transaction('sessions').objectStore('sessions').index('status');
      return (await Promise.all(['running', 'paused', 'recalibrating'].map(status => request<Session[]>(index.getAll(status))))).flat();
    },
  };
}
function readLegacy(key: string): unknown {
  const value = localStorage.getItem(key);
  if (!value) return null;
  try { return JSON.parse(value); } catch { throw new Error('以前の保存データを読み込めません。データを消さずに再試行してください。'); }
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object'; }
function legacySession(value: Record<string, unknown>, id: string): Session {
  const focusMs = typeof value.activeMeasurementMs === 'number' ? value.activeMeasurementMs : 0;
  const goodMs = typeof value.goodMs === 'number' ? value.goodMs : 0;
  const endedAt = typeof value.endedAt === 'string' ? value.endedAt : typeof value.acquiredAt === 'string' ? value.acquiredAt : null;
  return { id, startedAt: typeof value.startedAt === 'string' ? value.startedAt : endedAt ?? '', endedAt,
    status: 'completed', settings: DEFAULT_TIMER, phase: 'focus', cycle: 1, remainingMs: 0,
    focusMs, validMs: focusMs, goodMs, elapsedMs: focusMs, generation: 0, calibrations: [], samples: [], events: [], segment: 0,
    acquiredCharacterId: typeof value.characterId === 'string' ? normalizeCharacterId(value.characterId) : typeof value.acquiredCharacterId === 'string' ? normalizeCharacterId(value.acquiredCharacterId) : null,
    rewardQualified: value.rewardQualified === true || typeof value.characterId === 'string', legacy: true,
    legacyGoodRatio: typeof value.goodRatio === 'number' ? value.goodRatio : undefined,
    lastTickMs: null, wasPaused: false, lastSampleFocusMs: -1000, tracking: null };
}
export class WorkRepository {
  constructor(private driver: WorkDriver) {}
  async initialize() {
    let collection = await this.driver.collection();
    if (!collection) {
      const rawCards = readLegacy('posture.characters.acquired.v1');
      const journal = readLegacy('posture.mobile.measurement-journal.v1');
      const reset = readLegacy('posture.mobile.collection-reset.v1');
      const erased = new Set(record(reset) && Array.isArray(reset.measurementIds) ? reset.measurementIds : []);
      const cards: Card[] = []; const seen = new Set<string>();
      const sessions = new Map<string, Session>();
      if (Array.isArray(journal)) for (const item of journal) {
        if (record(item) && typeof item.id === 'string') sessions.set(item.id, legacySession(item, item.id));
      }
      if (Array.isArray(rawCards)) for (const item of rawCards) {
        if (!record(item) || typeof item.characterId !== 'string' || typeof item.measurementId !== 'string' || typeof item.acquiredAt !== 'string') continue;
        const id = normalizeCharacterId(item.characterId);
        if (!sessions.has(item.measurementId)) sessions.set(item.measurementId, legacySession(item, item.measurementId));
        if (erased.has(item.measurementId) || seen.has(id)) continue;
        seen.add(id); cards.push({ characterId: id, measurementId: item.measurementId, acquiredAt: item.acquiredAt, generation: 0 });
      }
      for (const session of sessions.values()) await this.driver.checkpoint(session);
      const selected = normalizeCharacterId(localStorage.getItem('posture.characters.profile.v1') ?? '');
      const migrated = { ...EMPTY_COLLECTION, cards, selectedId: seen.has(selected) ? selected : null, migrated: true };
      await this.driver.compareAndSet(null, migrated);
      collection = await this.driver.collection();
    }
    if (!collection) throw new Error('保存先を準備できませんでした');
    return collection;
  }
  async recover() {
    const interrupted = await this.driver.interrupted();
    for (const session of interrupted) await this.driver.checkpoint({ ...session, status: 'interrupted', endedAt: new Date().toISOString(), rewardQualified: false, lastTickMs: null });
    return interrupted.length;
  }
  async collection() { const value = await this.driver.collection(); if (!value) throw new Error('コレクションを読み込めません'); return value; }
  session(id: string) { return this.driver.session(id); }
  checkpoint(session: Session) { return this.driver.checkpoint(structuredClone(session)); }
  private async update(change: (value: Collection) => Collection) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.collection(); const next = change(structuredClone(current)); next.revision = current.revision + 1;
      if (await this.driver.compareAndSet(current.revision, next)) return next;
    }
    throw new Error('別の画面で更新されています。もう一度お試しください。');
  }
  select(id: string) { return this.update(value => ({ ...value, selectedId: value.cards.some(card => card.characterId === id) ? id : value.selectedId })); }
  timer(timer: TimerSettings | null) { return this.update(value => ({ ...value, timer: timer && normalizeTimer(timer) })); }
  reset() { return this.update(value => ({ ...value, generation: value.generation + 1, cards: [], selectedId: null })); }
  async finish(input: Session, catalogIds: string[]) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.collection(); const existing = await this.driver.session(input.id);
      if (existing && ['completed', 'interrupted'].includes(existing.status) && !existing.legacy) return { session: existing, collection: current };
      const session = structuredClone(input); const next = structuredClone(current); next.revision += 1;
      if (session.rewardQualified && session.generation === current.generation) {
        session.acquiredCharacterId = chooseReward(current.cards, catalogIds);
        if (session.acquiredCharacterId) next.cards.push({ characterId: session.acquiredCharacterId, measurementId: session.id, acquiredAt: session.endedAt!, generation: current.generation });
      }
      if (await this.driver.compareAndSet(current.revision, next, session)) return { session, collection: next };
    }
    throw new Error('結果の保存に失敗しました。再試行してください。');
  }
}
