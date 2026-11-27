import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const browser = new Window({ url: 'https://example.test/app' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperties(browser.HTMLVideoElement.prototype, {
  play: { value: async () => {} }, srcObject: { configurable: true, writable: true, value: null },
});
const stop = mock(() => {});
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
const getUserMedia = mock(async (_constraints: MediaStreamConstraints) => stream);
let devices: MediaDeviceInfo[] = [];
const enumerateDevices = mock(async () => devices);
const media = Object.assign(new browser.EventTarget(), { getUserMedia, enumerateDevices });
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
mock.module('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => { throw new Error('No model download in camera test'); } },
  PoseLandmarker: {}, DrawingUtils: class {},
}));
const { CameraSettings } = await import('../src/features/posture/CameraSettings');
const { CAMERA_DEVICE_KEY, loadCameraDeviceId, saveCameraDeviceId, openMeasurementCamera } = await import('../src/features/posture/camera');
const { usePostureTracking } = await import('../src/features/posture/hooks/usePostureTracking');
const { setAppLanguage } = await import('../src/features/i18n');
const device = (deviceId: string, label = '', kind = 'videoinput') => ({ deviceId, label, kind }) as MediaDeviceInfo;
const host = document.createElement('div'); document.body.append(host);
let root = createRoot(host), mounted = true;
beforeEach(() => {
  localStorage.clear(); setAppLanguage('ja'); devices = [];
  stop.mockClear(); getUserMedia.mockReset(); getUserMedia.mockImplementation(async () => stream);
  enumerateDevices.mockReset(); enumerateDevices.mockImplementation(async () => devices);
});
afterEach(async () => { if (mounted) await act(async () => root.unmount()); root = createRoot(host); mounted = true; });
async function render() { await act(async () => root.render(<CameraSettings />)); }
async function refresh() { await act(async () => host.querySelector<HTMLButtonElement>('button')!.click()); }
async function select(value: string) {
  await act(async () => { const el = host.querySelector('select')!; el.value = value; el.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event); });
}

test('guests can select a persistent camera without opening it or requiring account context', async () => {
  devices = [device('built-in', 'Built-in'), device('usb', 'USB'), device('mic', 'Microphone', 'audioinput')];
  await render();
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(host.querySelectorAll('option')).toHaveLength(3);
  expect(host.querySelector('label')!.htmlFor).toBe(host.querySelector('select')!.id);
  await select('usb'); expect(loadCameraDeviceId()).toBe('usb');
  await act(async () => root.unmount()); root = createRoot(host); await render();
  expect(host.querySelector('select')!.value).toBe('usb');
  await openMeasurementCamera(1080);
  expect(getUserMedia).toHaveBeenLastCalledWith({ video: { deviceId: { exact: 'usb' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  await select(''); await openMeasurementCamera();
  expect(localStorage.getItem(CAMERA_DEVICE_KEY)).toBeNull();
  expect(getUserMedia.mock.calls.at(-1)![0].video).toMatchObject({ facingMode: 'user' });
});

test('the real posture hook uses the selected device and releases it on unmount', async () => {
  saveCameraDeviceId('usb');
  function Tracking() { const { videoRef, canvasRef } = usePostureTracking({ enabled: true, captureHeight: 1080 }); return <><video ref={videoRef} /><canvas ref={canvasRef} /></>; }
  await act(async () => root.render(<Tracking />));
  expect(getUserMedia.mock.calls[0][0].video).toMatchObject({ deviceId: { exact: 'usb' }, height: { ideal: 1080 } });
  await act(async () => root.unmount()); mounted = false;
  expect(stop).toHaveBeenCalledTimes(1);
});

test('resolution retry retains the exact device, and missing or denied devices never use a default', async () => {
  saveCameraDeviceId('usb');
  getUserMedia.mockRejectedValueOnce(Object.assign(new Error('unsupported'), { name: 'OverconstrainedError', constraint: 'width' }));
  await openMeasurementCamera();
  expect(getUserMedia.mock.calls[1][0]).toEqual({ video: { deviceId: { exact: 'usb' } }, audio: false });
  for (const name of ['NotFoundError', 'NotAllowedError', 'NotReadableError', 'OverconstrainedError']) {
    getUserMedia.mockClear(); getUserMedia.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { name, constraint: 'deviceId' }));
    await expect(openMeasurementCamera()).rejects.toThrow(); expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(loadCameraDeviceId()).toBe('usb');
  }
});

test('refresh unlocks names only on explicit request, and stops its temporary stream', async () => {
  devices = [device('built-in')]; await render();
  expect(getUserMedia).not.toHaveBeenCalled();
  getUserMedia.mockImplementation(async () => { devices = [device('built-in', 'Built-in'), device('usb', 'USB')]; return stream; });
  await refresh(); expect(stop).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('USB');
  await refresh(); expect(getUserMedia).toHaveBeenCalledTimes(1);
});

test('unmount before permission resolves stops the late stream', async () => {
  let finish!: (stream: MediaStream) => void;
  getUserMedia.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); await refresh();
  expect(host.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
  await act(async () => root.unmount()); mounted = false;
  await act(async () => finish(stream)); expect(stop).toHaveBeenCalledTimes(1);
});

test('enumeration failure after permission releases the camera and allows retry', async () => {
  await render(); enumerateDevices.mockRejectedValueOnce(new Error('enumeration failed'));
  await refresh(); expect(stop).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role=status]')!.textContent).toContain('一覧を取得できません');
  expect(host.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
});

test('denied permission is recoverable; hot unplug keeps the saved selection', async () => {
  await render(); getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  await refresh(); expect(host.querySelector('[role=status]')!.textContent).toContain('カメラを許可');
  devices = [device('usb', 'USB')]; await refresh(); await select('usb');
  devices = []; await act(async () => media.dispatchEvent(new browser.Event('devicechange')));
  expect(host.querySelector('select')!.value).toBe('usb'); expect(loadCameraDeviceId()).toBe('usb');
  expect(host.querySelector('option[value=usb]')!.textContent).toContain('未接続');
});

test('failed persistence is not reported as a saved selection', async () => {
  devices = [device('usb', 'USB')]; await render();
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: original.getItem.bind(original), setItem: () => { throw new Error('storage denied'); } } });
  try { await select('usb'); expect(host.textContent).toContain('保存できません'); expect(host.querySelector('select')!.value).toBe(''); }
  finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }); }
});

test('camera settings translate and account storage events do not clear camera choice', async () => {
  devices = [device('usb', 'USB')]; saveCameraDeviceId('usb'); await render();
  for (const [language, heading] of [['en', 'Measurement camera'], ['ko', '측정용 카메라']] as const) {
    await act(async () => setAppLanguage(language)); expect(host.querySelector('h2')!.textContent).toBe(heading);
  }
  await act(async () => window.dispatchEvent(new browser.StorageEvent('storage', { key: 'piiin.accounts' }) as unknown as Event));
  expect(host.querySelector('select')!.value).toBe('usb');
});
