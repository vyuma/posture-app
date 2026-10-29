import { beforeEach, describe, expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { advanceSession, beginCalibration, createSession, endCalibration, finishSession, goodRatio, pauseSession, resumeSession, normalizeTimer, timerValid, displayScore, type Baseline } from '../src/features/work/model';
import { openBrowserDriver, WorkRepository } from '../src/features/work/repository';
import { graphSegments, graphTimeTicks, closestGraphSample } from '../src/features/work/ScoreGraph';
import { advanceWithRestCue } from '../src/features/work/sessionSound';

const baseline = { stats: {}, headWidthRatio: 0.8 } as Baseline;
const good = { valid: true, good: true, deviation: 0.3 }, bad = { valid: true, good: false, deviation: 2 }, missing = { valid: false, good: false, deviation: 0 };
const settings = { focusMinutes: 5, restMinutes: 5, cycles: 2 };
const make = (id = crypto.randomUUID(), generation = 0) => createSession(id, settings, generation, baseline);
function run(session: ReturnType<typeof make>, seconds: number, reading = good) { if (session.lastTickMs === null) advanceSession(session, 0, reading); for (let i = 0; i < seconds; i++) advanceSession(session, (session.lastTickMs ?? 0) + 1000, reading); }
beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
  const data = new Map<string, string>(); Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }, configurable: true });
});
describe('measurement clock and scores', () => {
  test('sounds once on focus to rest, never on recovery, resume, rest to focus or completion', () => {
    const session = createSession('cue', { focusMinutes: 1, restMinutes: 1, cycles: 2 }, 0, baseline);
    let cues = 0;
    const step = (time: number, reading = good) => advanceWithRestCue(session, time, reading, () => cues++);
    step(0, bad); step(1000, good);
    expect(cues).toBe(0);
    pauseSession(session, good); step(20_000); resumeSession(session); step(20_000);
    expect(cues).toBe(0);
    step(79_000); // Remaining 59 seconds of focus, then the first rest starts.
    expect(session.phase).toBe('rest'); expect(cues).toBe(1);
    step(79_250); step(139_000);
    expect(session.phase).toBe('focus'); expect(cues).toBe(1);
    step(199_000);
    expect(session.status).toBe('completed'); expect(cues).toBe(1);
  });
  test('a single cycle and manual finish do not play a rest cue', () => {
    const session = createSession('single-cue', { focusMinutes: 1, restMinutes: 0, cycles: 1 }, 0, baseline);
    let cues = 0;
    advanceWithRestCue(session, 0, good, () => cues++);
    advanceWithRestCue(session, 60_000, good, () => cues++);
    expect(session.status).toBe('completed'); expect(cues).toBe(0);
    const stopped = make(); advanceWithRestCue(stopped, 0, good, () => cues++);
    finishSession(stopped); advanceWithRestCue(stopped, 60_000, good, () => cues++);
    expect(cues).toBe(0);
  });
  test('accepts one-minute edits with exact bounds', () => { expect(timerValid({ focusMinutes: 36, restMinutes: 7, cycles: 4 })).toBe(true); expect(timerValid({ ...settings, restMinutes: 0 })).toBe(false); expect(timerValid({ ...settings, focusMinutes: 5.5 })).toBe(false); expect(displayScore(1.6)).toBe(50); expect(displayScore(8)).toBe(0); });
  test('normalizes empty, negative, excessive and fractional values without snapping minutes to five', () => {
    expect(normalizeTimer({ focusMinutes: NaN, restMinutes: -1, cycles: 4 })).toEqual({ focusMinutes: 1, restMinutes: 1, cycles: 4 });
    expect(normalizeTimer({ focusMinutes: 999, restMinutes: 999, cycles: 99 })).toEqual({ focusMinutes: 120, restMinutes: 60, cycles: 12 });
    expect(normalizeTimer({ focusMinutes: 36.9, restMinutes: 7, cycles: 2 })).toEqual({ focusMinutes: 36, restMinutes: 7, cycles: 2 });
    expect(timerValid({ focusMinutes: 1, restMinutes: 1, cycles: 2 })).toBe(true);
    expect(timerValid({ focusMinutes: 120, restMinutes: 60, cycles: 12 })).toBe(true);
    expect(timerValid({ focusMinutes: 121, restMinutes: 1, cycles: 2 })).toBe(false);
    expect(timerValid({ focusMinutes: 1, restMinutes: 61, cycles: 2 })).toBe(false);
  });
  test('one cycle always stores zero rest and finishes after its one-minute focus', () => {
    const session = createSession('single', { focusMinutes: 1, restMinutes: 60, cycles: 1 }, 0, baseline);
    expect(session.settings.restMinutes).toBe(0);
    expect(timerValid(session.settings)).toBe(true);
    expect(timerValid({ focusMinutes: 1, restMinutes: 5, cycles: 1 })).toBe(false);
    run(session, 60);
    expect(session.status).toBe('completed');
    expect(session.elapsedMs).toBe(60_000);
    expect(session.events.filter(event => event.kind === 'rest')).toHaveLength(0);
  });
  test('automatically completes after the last focus without another rest', () => { const session = make(); run(session, 900); expect(session.status).toBe('completed'); expect(session.focusMs).toBe(600_000); expect(session.goodMs).toBe(600_000); expect(session.elapsedMs).toBe(900_000); expect(session.cycle).toBe(2); expect(session.events.filter(event => event.kind === 'rest')).toHaveLength(1); });
  test('pause preserves rest and remaining time; recalibration preserves session and prior pause', () => { const session = make(); run(session, 310); pauseSession(session, good); const remaining = session.remainingMs; run(session, 20); expect(session.remainingMs).toBe(remaining); beginCalibration(session, good); run(session, 10); endCalibration(session, { ...baseline, headWidthRatio: 0.9 }); expect(session.status).toBe('paused'); expect(session.phase).toBe('rest'); expect(session.calibrations).toHaveLength(2); expect(session.focusMs).toBe(300_000); resumeSession(session); run(session, 1); expect(session.remainingMs).toBe(remaining - 1000); });
  test('failed recalibration restores previous calibration and retains all samples', () => { const session = make(); run(session, 10); const samples = session.samples.length; beginCalibration(session, good); run(session, 5); endCalibration(session, null); expect(session.calibrations).toHaveLength(1); expect(session.focusMs).toBe(10_000); expect(session.samples.length).toBeGreaterThanOrEqual(samples); expect(session.status).toBe('running'); });
  test('new sessions include missing and stale focus time in the ratio without fabricating graph scores', () => { const session = make(); run(session, 10); run(session, 10, bad); run(session, 20, missing); advanceSession(session, session.lastTickMs! + 60_000, good); expect(goodRatio(session)).toBe(0.1); expect(session.focusMs).toBe(100_000); expect(session.validMs).toBe(20_000); expect(session.samples[session.samples.length - 1].score).toBeNull(); finishSession(session); expect(session.rewardQualified).toBe(false); });
  test('manual finish keeps the exact final sample between one-second ticks', () => { const session = make(); run(session, 1); advanceSession(session, 1250, bad); finishSession(session, undefined, bad); expect(session.samples.at(-1)?.focusMs).toBe(1250); expect(session.samples.at(-1)?.state).toBe('bad'); });
  test('zero valid time has no ratio or reward', () => { const session = make(); run(session, 2, missing); finishSession(session); expect(goodRatio(session)).toBeNull(); expect(session.rewardQualified).toBe(false); });
  test('plot segments stay separate around pauses and gaps', () => { const session = make(); run(session, 5); pauseSession(session, good); resumeSession(session); run(session, 5); run(session, 5, missing); run(session, 5); const groups = graphSegments(session.samples, 2); expect(groups.length).toBe(3); for (const group of groups) expect(new Set(group.map(point => point.segment)).size).toBe(1); });
});
describe('atomic local history and collection', () => {
  async function repository() { const driver = await openBrowserDriver(); const repo = new WorkRepository(driver); await repo.initialize(); return { repo, driver }; }
  const finishGood = (generation = 0) => { const session = make(undefined, generation); run(session, 1); finishSession(session); return session; };
  test('saved one-minute settings survive reopening and one-cycle rest remains zero', async () => {
    const { repo, driver } = await repository();
    await repo.timer({ focusMinutes: 1, restMinutes: 1, cycles: 2 });
    const reopened = new WorkRepository(driver);
    expect((await reopened.initialize()).timer).toEqual({ focusMinutes: 1, restMinutes: 1, cycles: 2 });
    await repo.timer({ focusMinutes: 120, restMinutes: 60, cycles: 1 });
    expect((await reopened.collection()).timer).toEqual({ focusMinutes: 120, restMinutes: 0, cycles: 1 });
  });
  test('starts empty; failed attempt does not consume Shima; one second can qualify', async () => { const { repo } = await repository(); expect((await repo.collection()).cards).toHaveLength(0); const fail = make(); run(fail, 10, bad); finishSession(fail); await repo.finish(fail, ['normal-nago', 'shin-anago']); const win = await repo.finish(finishGood(), ['normal-nago', 'shin-anago']); expect(win.session.acquiredCharacterId).toBe('normal-nago'); expect(win.collection.cards).toHaveLength(1); });
  test('simultaneous finalization is idempotent and late checkpoints cannot overwrite results', async () => { const { repo } = await repository(); const session = finishGood(); const pending = { ...session, status: 'running' as const }; await Promise.all([repo.finish(session, ['normal-nago']), repo.finish(session, ['normal-nago'])]); await repo.checkpoint(pending); expect((await repo.collection()).cards).toHaveLength(1); expect((await repo.session(session.id))?.status).toBe('completed'); });
  test('reset retains history and timer, rejects old rewards, restart never imports erased cards', async () => { const { repo, driver } = await repository(); const session = finishGood(); await repo.timer(settings); await repo.finish(session, ['normal-nago']); await repo.select('normal-nago'); await repo.reset(); await repo.finish(session, ['normal-nago']); await repo.finish(finishGood(0), ['normal-nago']); const reopened = new WorkRepository(driver); await reopened.initialize(); const collection = await reopened.collection(); expect(collection.cards).toHaveLength(0); expect(collection.selectedId).toBeNull(); expect(collection.timer).toEqual(settings); expect((await reopened.session(session.id))?.acquiredCharacterId).toBe('normal-nago'); expect((await reopened.finish(finishGood(collection.generation), ['normal-nago'])).session.acquiredCharacterId).toBe('normal-nago'); });
  test('unique rewards stop after catalog completion', async () => { const { repo } = await repository(); for (let i = 0; i < 4; i++) await repo.finish(finishGood(), ['normal-nago', 'shin-anago']); expect((await repo.collection()).cards.map(card => card.characterId)).toEqual(['normal-nago', 'shin-anago']); });
  test('crash recovery retains checkpoint without reward or automatic resumption', async () => { const { repo } = await repository(); const session = make(); run(session, 10); await repo.checkpoint(session); expect(await repo.recover()).toBe(1); expect((await repo.session(session.id))?.status).toBe('interrupted'); finishSession(session); const recovered = await repo.finish(session, ['normal-nago']); expect(recovered.collection.cards).toHaveLength(0); expect(recovered.session.status).toBe('interrupted'); });
  test('next reward survives reopening, is used once, and cannot duplicate an owned card', async () => {
    const { repo, driver } = await repository(); const ids = ['normal-nago', 'sakura-nago'];
    await repo.nextReward('sakura-nago', ids);
    const reopened = new WorkRepository(driver);
    expect((await reopened.initialize()).nextRewardId).toBe('sakura-nago');
    const first = await reopened.finish(finishGood(), ids);
    expect(first.session.acquiredCharacterId).toBe('sakura-nago');
    expect(first.collection.nextRewardId).toBeNull();
    expect((await repo.finish(first.session, ids)).collection.cards).toHaveLength(1);
    await expect(repo.nextReward('sakura-nago', ids)).rejects.toThrow('未獲得');
    const second = await repo.finish(finishGood(), ids);
    expect(second.session.acquiredCharacterId).toBe('normal-nago');
    expect((await repo.finish(finishGood(), ids)).session.acquiredCharacterId).toBeNull();
  });
  test('failed posture and interrupted sessions do not consume the next reward', async () => {
    const { repo } = await repository(); const ids = ['normal-nago', 'king-nago'];
    await repo.nextReward('king-nago', ids);
    for (const reading of [bad, missing]) {
      const session = make(); run(session, 3, reading); finishSession(session);
      const result = await repo.finish(session, ids);
      expect(result.session.acquiredCharacterId).toBeNull();
      expect(result.collection.nextRewardId).toBe('king-nago');
    }
    const interrupted = make(); run(interrupted, 2); await repo.checkpoint(interrupted); await repo.recover();
    finishSession(interrupted); await repo.finish(interrupted, ids);
    expect((await repo.collection()).nextRewardId).toBe('king-nago');
  });
  test('save failure leaves both reward and one-time selection untouched until retry', async () => {
    const { repo, driver } = await repository(); const ids = ['normal-nago', 'miira-nago'];
    await repo.nextReward('miira-nago', ids);
    const failing = new WorkRepository({ ...driver, compareAndSet: async () => { throw new Error('disk full'); } });
    const session = finishGood();
    await expect(failing.finish(session, ids)).rejects.toThrow('disk full');
    expect((await repo.collection()).nextRewardId).toBe('miira-nago');
    expect((await repo.collection()).cards).toHaveLength(0);
    expect(await repo.session(session.id)).toBeNull();
    expect((await repo.finish(session, ids)).session.acquiredCharacterId).toBe('miira-nago');
    expect((await repo.collection()).nextRewardId).toBeNull();
  });
  test('concurrent results consume a selected character exactly once', async () => {
    const { repo } = await repository(); const ids = ['normal-nago', 'sakura-nago'];
    await repo.nextReward('sakura-nago', ids);
    const results = await Promise.all([repo.finish(finishGood(), ids), repo.finish(finishGood(), ids)]);
    expect(results.map(result => result.session.acquiredCharacterId).sort()).toEqual([...ids].sort());
    expect((await repo.collection()).cards).toHaveLength(2);
    expect((await repo.collection()).nextRewardId).toBeNull();
  });
  test('selection can be cancelled, rejects unknown IDs, and resets with the collection', async () => {
    const { repo } = await repository(); const ids = ['normal-nago', 'sakura-nago'];
    await expect(repo.nextReward('unknown', ids)).rejects.toThrow('未獲得');
    await repo.nextReward('sakura-nago', ids); await repo.nextReward(null, ids);
    expect((await repo.collection()).nextRewardId).toBeNull();
    expect((await repo.finish(finishGood(), ids)).session.acquiredCharacterId).toBe('normal-nago');
    await repo.nextReward('sakura-nago', ids); await repo.reset();
    expect((await repo.collection()).nextRewardId).toBeNull();
    await repo.nextReward('sakura-nago', ids);
    const old = await repo.finish(finishGood(0), ids);
    expect(old.session.acquiredCharacterId).toBeNull();
    expect(old.collection.nextRewardId).toBe('sakura-nago');
  });
  test('stale or removed selections cannot create duplicate or unknown rewards', async () => {
    const { repo, driver } = await repository(); const ids = ['normal-nago', 'sakura-nago'];
    await repo.finish(finishGood(), ids);
    const current = await repo.collection();
    await driver.compareAndSet(current.revision, { ...current, revision: current.revision + 1, nextRewardId: 'normal-nago' });
    expect((await repo.finish(finishGood(), ids)).session.acquiredCharacterId).toBe('sakura-nago');
    await repo.reset(); await repo.nextReward('sakura-nago', ids);
    const updated = await repo.collection();
    expect((await repo.finish(finishGood(updated.generation), ['normal-nago'])).session.acquiredCharacterId).toBe('normal-nago');
  });
  test('legacy acquisition is preserved without inventing graph data', async () => { localStorage.setItem('posture.characters.acquired.v1', JSON.stringify([{ characterId: 'normal-nago', measurementId: 'legacy1', acquiredAt: '2026-10-25T00:00:00Z', activeMeasurementMs: 60000, goodRatio: 0.8 }])); const { repo } = await repository(); expect((await repo.collection()).cards).toHaveLength(1); const session = await repo.session('legacy1'); expect(session?.samples).toEqual([]); expect(goodRatio(session!)).toBe(0.8); });
});

describe('result graph inspection', () => {
  test('shows readable minute ticks and the exact duration without a crowded final tick', () => {
    expect(graphTimeTicks(140 * 60_000)).toEqual([0,30,60,90,120,140].map(value => value * 60_000));
    expect(graphTimeTicks(61 * 60_000)).toEqual([0,15,30,45,61].map(value => value * 60_000));
    expect(graphTimeTicks(20_000)).toEqual([0,20_000]);
    expect(graphTimeTicks(0)).toEqual([0]);
  });
  test('selects both sides of a recalibration boundary and clamps to the end samples', () => {
    const points = [{ focusMs: 0, score: 90 }, { focusMs: 60_000, score: 20 }, { focusMs: 60_000, score: 100 }, { focusMs: 120_000, score: null }] as ReturnType<typeof make>['samples'];
    expect(closestGraphSample(points,60_000,25)).toBe(1);
    expect(closestGraphSample(points,60_000,95)).toBe(2);
    expect(closestGraphSample(points,-1,20)).toBe(0);
    expect(closestGraphSample(points,130_000,50)).toBe(3);
  });
});
