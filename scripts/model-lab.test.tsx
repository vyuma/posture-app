import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createPostureEngineState, evaluatePostureFrame } from '../src/features/posture/engine';
import { computeFeatureReliability, computeScore } from '../src/features/posture/engine.score';
import { pickLandmarkSetFromSource } from '../src/features/posture/engine.pose.landmarks';

const browser = new Window({ url: 'https://example.test/dev/model' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const callbacks = new Map<number, FrameRequestCallback>();
let nextId = 0, now = 0;
globalThis.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
globalThis.cancelAnimationFrame = id => { callbacks.delete(id); };
Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
Object.defineProperties(browser.HTMLVideoElement.prototype, {
  srcObject: { configurable: true, writable: true, value: null },
  play: { configurable: true, value: async () => {} },
  readyState: { configurable: true, get: () => 4 },
  videoWidth: { configurable: true, get: () => 1280 },
  videoHeight: { configurable: true, get: () => 720 },
});
Object.defineProperty(browser.HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => new Proxy({}, { get: () => () => {} }) });
const stop = mock(() => {}), close = mock(() => {});
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
function points(offset = 0) {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [i, x, y] of [[0,.5,.2],[7,.43,.24],[8,.57,.24],[11,.35,.45],[12,.65,.45],[23,.4,.8],[24,.6,.8]]) p[i] = { x: x + (i < 11 ? offset : 0), y, z: 0, visibility: 1 };
  return p;
}
let landmarks: ReturnType<typeof points> | null = points();
const detect = mock(() => ({ landmarks: landmarks ? [landmarks] : [], worldLandmarks: [] }));
const load = mock(async () => ({}));
const create = mock(async () => ({ detectForVideo: detect, close }));
const getUserMedia = mock(async () => stream);
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
mock.module('@mediapipe/tasks-vision', () => ({ FilesetResolver: { forVisionTasks: load }, PoseLandmarker: { createFromOptions: create } }));
const { saveCameraDeviceId } = await import('../src/features/posture/camera');
const { default: ModelLab } = await import('../src/features/posture/ModelLab');
const host = document.createElement('div'); document.body.append(host);
let root = createRoot(host), mounted = true;
beforeEach(() => {
  localStorage.clear(); getUserMedia.mockClear();
  now = 0; callbacks.clear(); landmarks = points(); stop.mockClear(); close.mockClear();
  load.mockReset(); load.mockImplementation(async () => ({}));
  create.mockReset(); create.mockImplementation(async () => ({ detectForVideo: detect, close }));
  detect.mockReset(); detect.mockImplementation(() => ({ landmarks: landmarks ? [landmarks] : [], worldLandmarks: [] }));
});
afterEach(async () => { if (mounted) await act(() => root.unmount()); root = createRoot(host); mounted = true; });
async function render() { await act(async () => { root.render(<ModelLab />); }); }
async function tick() {
  now += 100;
  const queued = [...callbacks.values()]; callbacks.clear();
  await act(() => { queued.forEach(callback => callback(now)); });
}
async function calibrated() { await render(); for (let i = 0; i < 61; i++) await tick(); }

test('model initialization failure releases the acquired camera', async () => {
  create.mockRejectedValueOnce(new Error('model unavailable'));
  await render();
  expect(host.textContent).toContain('初期化に失敗');
  expect(stop).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
});

test('inference failure releases model and camera exactly once, including unmount', async () => {
  detect.mockImplementationOnce(() => { throw new Error('inference failed'); });
  await render(); await tick();
  expect(host.textContent).toContain('計測中にエラー');
  expect(stop).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
  await act(() => root.unmount()); mounted = false;
  expect(stop).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
});

test('unmount during WASM loading does not create a late model', async () => {
  let finish!: (value: object) => void;
  load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); await act(() => root.unmount()); mounted = false;
  await act(async () => { finish({}); });
  expect(create).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
});

test('a model resolving after unmount is closed and cannot restart the camera loop', async () => {
  let finish!: (value: { detectForVideo: typeof detect; close: typeof close }) => void;
  create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); await act(() => root.unmount()); mounted = false;
  await act(async () => { finish({ detectForVideo: detect, close }); });
  expect(stop).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
});

test('tracking loss leaves a gap in raw history without substituting held EMA', async () => {
  await calibrated(); landmarks = points(.08); await tick();
  const raw = () => host.querySelector('.ml-spark .raw')!.getAttribute('d')!;
  const ema = () => host.querySelector('.ml-spark .ema')!.getAttribute('d')!;
  const before = raw(), emaBefore = ema();
  landmarks = null; await tick();
  expect(raw()).toBe(before); expect(ema()).not.toBe(emaBefore);
  landmarks = points(.08); await tick();
  expect((raw().match(/M/g) ?? []).length).toBe(2);
});

test('recalibration clears the displayed baseline before another camera frame', async () => {
  await calibrated();
  expect(host.textContent).not.toContain('CALIBRATING');
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === '再キャリブレーション')!;
  await act(() => button.click());
  expect(host.textContent).toContain('CALIBRATING');
  expect(host.querySelector('.ml-spark .raw')!.getAttribute('d')).toBe('');
});

test('displayed raw and EMA agree with the real engine during a measured deviation', async () => {
  await render(); let expected = createPostureEngineState();
  for (let i = 0; i < 70; i++) {
    landmarks = points(i > 60 ? .08 : 0);
    await tick();
    const out = evaluatePostureFrame(expected, now, landmarks, null, null, { difficulty: 'normal', dualMonitor: false });
    expected = out.state;
    if (!expected.baseline || !out.result.features) continue;
    const f = out.result.features, e = out.result.eval;
    const raw = computeScore(f, e.view, expected.baseline, null, e.headWidthRatio!, expected.baselineHeadWidthRatio, e.isHeadTurned,
      computeFeatureReliability(pickLandmarkSetFromSource(landmarks, null, 'image'), pickLandmarkSetFromSource(landmarks, null, 'world'), f)).scoreEma;
    const cells = host.querySelectorAll('.ml-eq > div');
    expect(Number(cells[2].querySelector('em')!.textContent)).toBeCloseTo(raw, 3);
    expect(Number(cells[4].querySelector('em')!.textContent)).toBeCloseTo(expected.emaScore!, 3);
  }
  expect(expected.baseline).not.toBeNull();
});

test('model lab uses the same saved camera as posture measurement', async () => {
  saveCameraDeviceId('external-usb'); await render();
  expect(getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: 'external-usb' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
});
