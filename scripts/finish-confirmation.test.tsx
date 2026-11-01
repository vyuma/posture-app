import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { IDBFactory } from 'fake-indexeddb';
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { openBrowserDriver, WorkRepository } from '../src/features/work/repository';
import type { Baseline, Session } from '../src/features/work/model';
import type { WidgetAction, WidgetState } from '../src/features/work/Widget';
import { recordingAllowed } from '../src/features/timelapse/recorder';

// Exercise the real WorkApp controller, dialog, measurement UI, clock and storage.
// Camera/encoding/native transport are replaced; no user database or camera is used.
// Run this file in its own Bun process to isolate module mocks (also in desktop CI).
const browser = new Window({ url: 'http://localhost' });
const TestMediaStream = browser.MediaStream;
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage, innerHeight: 800, matchMedia: browser.matchMedia.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, { MediaStream: TestMediaStream });
const baseline = { stats: {}, headWidthRatio: .8 } as Baseline;
let now = 0, inferencePaused = false, encoding = false;
let cycles = 1;
let widget: WidgetState | null = null;
let result: Session | null = null;
let nativeAction: ((id: string, action: WidgetAction) => void) | undefined;
let repo: WorkRepository;
let clockTick: () => void;
const snapshot = { baselineReady: true, qualityOk: true, observedAtMs: 0, trackingIntervalMs: 100,
  postureState: 'good', trackingStatus: 'tracked', presentationPosture: 'good', score: .3, warmupRemainingMs: 0 };
const videoRef = { current: null as HTMLVideoElement | null }, canvasRef = { current: null };
const posture = { snapshot, videoRef, canvasRef, status: '', ready: true, captureBaseline: () => baseline,
  resetPostureEngine: () => {}, restoreBaseline: () => {} };
mock.module('virtual:sound-options', () => ({ SOUND_OPTIONS: [] }));
mock.module('lottie-web', () => ({ default: {} }));
mock.module('../src/features/posture/hooks/usePostureTracking', () => ({ usePostureTracking: (options: { paused: boolean }) => {
  inferencePaused = options.paused;
  useLayoutEffect(() => { if (videoRef.current) videoRef.current.srcObject = new TestMediaStream() as unknown as MediaStream; });
  return posture;
} }));
mock.module('../src/features/work/usePostureSpeech', () => ({ usePostureSpeech: () => null }));
mock.module('../src/features/work/useWorkScreenTransition', () => ({ useWorkScreenTransition: () => undefined }));
mock.module('../src/features/work/measurementLock', () => ({ acquireMeasurementLock: async () => () => {} }));
mock.module('../src/features/work/platform', () => ({ isDesktop: true, openWorkRepository: async () => repo,
  publishWidget: async (value: WidgetState | null) => { widget = value; },
  subscribeWidgetActions: async (callback: typeof nativeAction) => { nativeAction = callback; return () => { nativeAction = undefined; }; } }));
mock.module('../src/features/sound/services/recoverySound', () => ({ configureRecoverySound: () => {}, playRecoverySound: () => {}, primeRecoverySound: () => {}, playSoundPreview: () => {} }));
mock.module('../src/features/onboarding', () => ({ hasCompletedOnboardingStory: () => true, saveOnboardingStoryCompleted: () => {},
  StoryHomeTransition: ({ children }: { children: (view: string) => ReactNode }) => children('home'), OnboardingStoryScreen: () => null }));
mock.module('../src/features/work/Home', () => ({ Brand: () => null, CharacterPicker: () => null,
  Home: ({ onStart }: { onStart: () => void }) => <button onClick={onStart}>start test session</button> }));
mock.module('../src/features/work/TimerSettings', () => ({ TimerSettings: ({ onSubmit }: any) => <button onClick={() => onSubmit({ focusMinutes: 1, restMinutes: cycles === 1 ? 0 : 1, cycles }, false)}>confirm test timer</button> }));
mock.module('../src/features/work/Widget', () => ({ Widget: () => null }));
mock.module('../src/features/work/ResultCard', () => ({ ResultCard: () => null }));
mock.module('../src/features/work/ResultScreen', () => ({ ResultScreen: ({ session }: { session: Session }) => { result = session; return <p>saved result</p>; } }));
mock.module('../src/features/updates/DesktopUpdater', () => ({ DesktopUpdater: () => null }));
mock.module('../src/features/timelapse/TimelapseScreen', () => ({ TimelapseScreen: () => null }));
mock.module('../src/features/timelapse/platform', () => ({ openTimelapseStore: async () => ({ recover: async () => 0 }) }));
mock.module('../src/features/timelapse/recorder', () => ({ recordingAllowed, TimelapseRecorder: class {
  begin() { return Promise.resolve(); }
  update(active: boolean) { encoding = active; }
  stop() { encoding = false; return Promise.resolve(); }
} }));
const { default: WorkApp } = await import('../src/features/work/WorkApp');
let root: Root, host: HTMLElement;
let nowSpy: ReturnType<typeof spyOn>, intervalSpy: ReturnType<typeof spyOn>;
beforeEach(async () => {
  now = 0; cycles = 1; widget = null; result = null; encoding = false;
  localStorage.clear(); localStorage.setItem('piiin.timelapse.settings.v1', JSON.stringify({ enabled: true }));
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
  repo = new WorkRepository(await openBrowserDriver());
  nowSpy = spyOn(performance, 'now').mockImplementation(() => now);
  intervalSpy = spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
    if (delay === 250) clockTick = callback;
    return 0;
  }) as typeof setInterval);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); nowSpy.mockRestore(); intervalSpy.mockRestore(); });
const button = (text: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent === text)!;
async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) await act(async () => { await Bun.sleep(10); });
  if (!condition()) throw new Error(`Expected UI state was not reached: ${host.textContent}`);
}
async function click(text: string) { await until(() => Boolean(button(text))); await act(async () => { button(text).click(); }); }
const tick = (time: number) => act(() => { now = time; snapshot.observedAtMs = time; clockTick(); });
const send = (action: WidgetAction) => act(() => { nativeAction!(widget!.sessionId, action); });
async function start() {
  await act(async () => root.render(<WorkApp />));
  await click('start test session'); await click('confirm test timer'); await click('準備できた！');
  await act(async () => { await Bun.sleep(1050); });
  await tick(0); await tick(1000);
  expect(widget?.paused).toBe(false);
}

test('confirmation pauses timer, scoring, inference, widget and recording; continue resumes without charging the dialog time', async () => {
  await start();
  expect(encoding).toBe(true);
  now = 1250; snapshot.observedAtMs = now;
  await click('終了');
  const remaining = widget!.remainingMs;
  expect(host.querySelector('dialog')?.open).toBe(true);
  expect(widget?.paused).toBe(true); expect(inferencePaused).toBe(true); expect(encoding).toBe(false);
  await tick(31_250);
  expect(widget?.remainingMs).toBe(remaining);
  await click('続ける');
  expect(widget?.paused).toBe(false); expect(inferencePaused).toBe(false); expect(encoding).toBe(true);
  await tick(31_250); await tick(32_250);
  expect(widget?.remainingMs).toBe(remaining - 1000);
  await click('終了'); await tick(52_250); await click('終了する');
  await until(() => result !== null);
  expect(result?.status).toBe('completed'); expect(result?.focusMs).toBe(2250); expect(result?.goodMs).toBe(2250);
  expect(widget).toBeNull(); expect(encoding).toBe(false);
  expect((await repo.session(result!.id))?.focusMs).toBe(2250);
});

test('native finish opens the same dialog; duplicate finish and native resume cannot release its pause', async () => {
  await start(); await send('finish'); await send('finish'); await send('resume'); await tick(21_000);
  expect(host.querySelector('dialog')?.open).toBe(true); expect(widget?.paused).toBe(true);
  expect(widget?.remainingMs).toBe(59_000);
  await click('続ける'); expect(widget?.paused).toBe(false);
});

test('continue preserves a pause that existed before the confirmation', async () => {
  await start(); await click('一時停止'); await send('finish'); await tick(21_000); await click('続ける');
  expect(widget?.paused).toBe(true); expect(encoding).toBe(false); expect(widget?.remainingMs).toBe(59_000);
  await click('再開'); expect(widget?.paused).toBe(false);
});

for (const dismissal of ['close', 'escape', 'backdrop']) test(`${dismissal} dismisses the confirmation and resumes`, async () => {
  await start(); await click('終了'); await tick(21_000);
  await act(() => {
    const dialog = host.querySelector('dialog')!;
    if (dismissal === 'close') dialog.querySelector<HTMLButtonElement>('[aria-label="閉じる"]')!.click();
    else if (dismissal === 'backdrop') dialog.click();
    else dialog.dispatchEvent(new browser.Event('cancel', { cancelable: true }) as unknown as Event);
  });
  expect(host.querySelector('dialog')).toBeNull(); expect(widget?.paused).toBe(false);
  expect(widget?.remainingMs).toBe(59_000);
});

test('rest countdown also pauses and resumes in the same cycle', async () => {
  cycles = 2; await start(); await tick(60_000);
  expect(widget?.phase).toBe('rest'); await click('終了'); await tick(90_000);
  expect(widget?.remainingMs).toBe(60_000); expect(widget?.paused).toBe(true);
  await click('続ける'); await tick(90_000); await tick(91_000);
  expect(widget?.phase).toBe('rest'); expect(widget?.cycle).toBe(1); expect(widget?.remainingMs).toBe(59_000);
  expect(encoding).toBe(false);
});

test('a session that reaches its end on the click finishes without reopening confirmation', async () => {
  await start(); now = 60_000; await click('終了');
  await until(() => result !== null);
  expect(result?.status).toBe('completed'); expect(host.querySelector('dialog')).toBeNull();
});
