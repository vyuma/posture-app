import { describe, expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { clampRect, eventAt, petEvent, replayPet, SPEEDS, type Clip } from '../src/features/timelapse/model';
import { recordingAllowed } from '../src/features/timelapse/recorder';
import { openBrowserTimelapse } from '../src/features/timelapse/storage';
import type { WidgetState } from '../src/features/work/Widget';

const widget: WidgetState = { sessionId: 'one', phase: 'focus', paused: false, bad: false, badSince: null, remainingMs: 60_000, durationMs: 60_000, cycle: 1, cycles: 2 };
describe('timelapse time and historical pet', () => {
  test('only running focus can be recorded', () => {
    for (const status of ['running', 'paused', 'recalibrating', 'completed', 'interrupted'] as const) for (const phase of ['focus', 'rest'] as const) {
      expect(recordingAllowed({ status, phase }, true)).toBe(status === 'running' && phase === 'focus');
      expect(recordingAllowed({ status, phase }, false)).toBe(false);
    }
    expect(recordingAllowed(null, true)).toBe(false);
  });
  test('seek reconstructs 30fps transition, timer and cycle from the same local time', () => {
    const initial = petEvent(0, widget);
    const bad = petEvent(2, { ...widget, bad: true, badSince: Date.now(), remainingMs: 58_000 }, initial);
    const resumed = petEvent(4, { ...widget, cycle: 2, remainingMs: 60_000 }, bad);
    const events = [initial, bad, resumed];
    expect(replayPet(events, 2.5)?.frame).toBe(198);
    expect(replayPet(events, 2.5)?.remainingMs).toBe(57_500);
    expect(replayPet(events, 5)?.remainingMs).toBe(59_000);
    expect(replayPet(events, 5)?.cycle).toBe(2);
    expect(replayPet(events, 2.5)?.frame).toBe(198); // Seeking backward doesn't accumulate state.
    expect(eventAt(events, -1)).toBeUndefined();
    expect(SPEEDS).toEqual([1, 2, 4, 6, 8, 16]);
  });
  test('same-time boundary uses resumed interval; reduced motion preserves the recorded timer', () => {
    const first = petEvent(0, widget);
    const next = petEvent(0, { ...widget, cycle: 2, bad: true, badSince: Date.now() }, first, true, true);
    expect(eventAt([first, next], 0)).toBe(next);
    expect(replayPet([first, next], 5)).toMatchObject({ frame: 1, growth: 0, angle: 0, cycle: 2, remainingMs: 55_000 });
  });
  test('free placement stays within the movie and rejects non-finite coordinates', () => {
    expect(clampRect({ x: -1, y: 2, width: 4, height: -2 })).toEqual({ x: 0, y: .88, width: 1, height: .12 });
    expect(clampRect({ x: NaN, y: Infinity, width: NaN, height: Infinity })).toEqual({ x: 0, y: 0, width: .3, height: .3 });
  });
});
test('reset rejects delayed metadata writes without touching measurement records', async () => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
  const store = await openBrowserTimelapse(`qa-test-${crypto.randomUUID()}`);
  const clip: Clip = { id: 'one', sessionId: 'one', generation: 0, epoch: 0, state: 'ready', file: 'one.webm', mime: 'video/webm', bytes: 1, width: 1280, height: 720, duration: 5, createdAt: '', assetVersion: 'expression-states-v1', events: [] };
  await store.put(clip); expect((await store.get('one'))?.duration).toBe(5);
  await store.clear(); expect(await store.get('one')).toBeNull(); expect(await store.epoch()).toBe(1);
  await expect(store.put(clip)).rejects.toThrow('初期化後');
  expect(await store.get('one')).toBeNull();
});

test('a full disk stops only recording, preserves older clips and releases the cloned camera track', async () => {
  const { TimelapseRecorder } = await import('../src/features/timelapse/recorder');
  const { createSession, DEFAULT_TIMER } = await import('../src/features/work/model');
  const globals = ['MediaRecorder', 'MediaStream', 'matchMedia'] as const;
  const previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let clonedStopped = false, originalStopped = false, writeAttempts = 0;
  const clone = { readyState: 'live', getSettings: () => ({ width: 1280, height: 720 }), stop: () => { clonedStopped = true; } };
  const track = { ...clone, clone: () => clone, stop: () => { originalStopped = true; } };
  class Recorder extends EventTarget {
    static isTypeSupported() { return true; }
    static latest: Recorder;
    state = 'inactive'; ondataavailable?: (event: { data: Blob }) => void;
    constructor() { super(); Recorder.latest = this; }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; queueMicrotask(() => this.dispatchEvent(new Event('stop'))); }
  }
  const clips = new Map<string, Clip>();
  const older = { id: 'older', file: 'older.mp4', state: 'ready' } as Clip; clips.set('older', older);
  const notices: string[] = [];
  const recordingStates: boolean[] = [];
  try {
    Object.defineProperty(globalThis, 'MediaRecorder', { value: Recorder, configurable: true });
    Object.defineProperty(globalThis, 'MediaStream', { value: class {}, configurable: true });
    Object.defineProperty(globalThis, 'matchMedia', { value: () => ({ matches: false }), configurable: true });
    const store = {
      epoch: async () => 0, get: async (id: string) => clips.get(id) ?? null,
      put: async (clip: Clip) => { clips.set(clip.id, structuredClone(clip)); },
      writer: async () => ({ write: async () => { writeAttempts++; throw new DOMException('Full', 'QuotaExceededError'); }, close: async () => {}, abort: async () => {} }),
      media: async () => { throw new Error('No readable new media'); }, remove: async () => { throw new Error('Must not delete any old video'); },
      clear: async () => {}, recover: async () => {}, deliver: async () => '', releaseExport: async () => {},
    };
    const baseline = { stats: {}, headWidthRatio: null } as Parameters<typeof createSession>[3];
    const session = createSession('new-recording', DEFAULT_TIMER, 0, baseline);
    const recording = new TimelapseRecorder(store, message => notices.push(message), () => {}, active => recordingStates.push(active));
    recording.update(true, widget, true);
    expect(recordingStates).toEqual([]); // Settings / intention alone must not claim capture started.
    await recording.begin(session, { getVideoTracks: () => [track] } as unknown as MediaStream, 720);
    expect(recordingStates).toEqual([true]);
    recording.update(false, widget, true);
    expect(Recorder.latest.state).toBe('paused');
    expect(recordingStates).toEqual([true, false]);
    recording.update(false, widget, true);
    recording.update(true, widget, true);
    expect(recordingStates).toEqual([true, false, true]);
    Recorder.latest.ondataavailable?.({ data: new Blob(['encoded packet']) });
    await new Promise(resolve => setTimeout(resolve, 0)); await recording.stop();
    expect(writeAttempts).toBe(1);
    expect(clips.get('older')).toBe(older);
    expect(clips.get(session.id)?.state).toBe('failed');
    expect(session.status).toBe('running');
    expect(originalStopped).toBe(false); expect(clonedStopped).toBe(true);
    expect(notices.join('')).toContain('録画のみ停止');
    expect(recordingStates).toEqual([true, false, true, false]);
  } finally { globals.forEach((key, index) => { const descriptor = previous[index]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }); }
});
