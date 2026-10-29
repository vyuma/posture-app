import { expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { openBrowserTimelapse } from '../src/features/timelapse/storage';
import { openVideoFrames } from '../src/features/timelapse/videoFrames';
import { recordingMime } from '../src/features/timelapse/recorder';

function replace(name: string, value: unknown) {
  const before = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  return () => { if (before) Object.defineProperty(globalThis, name, before); else Reflect.deleteProperty(globalThis, name); };
}

test('prepared browser sharing calls the API inside the new gesture with exactly one file', async () => {
  let gesture = false, calls = 0, released = 0, passed: ShareData | undefined;
  const restore = [replace('indexedDB', new IDBFactory()), replace('navigator', {
    canShare: () => true,
    share: (data: ShareData) => { expect(gesture).toBe(true); calls++; passed = data; return Promise.resolve(); },
  })];
  try {
    const store = await openBrowserTimelapse(`export-test-${crypto.randomUUID()}`);
    store.media = async () => ({ blob: new Blob(['recorded-video']), url: 'blob:test', release: () => { released++; } });
    const prepared = await store.prepareShare!('test.mp4', 'video/mp4;codecs=avc1.420028');
    expect(calls).toBe(0);
    gesture = true; const completion = prepared!.share(); gesture = false;
    expect(calls).toBe(1); await completion;
    expect(passed?.files).toHaveLength(1);
    expect(passed?.files?.[0].type).toBe('video/mp4');
    expect(await passed?.files?.[0].text()).toBe('recorded-video');
    prepared?.release(); expect(released).toBe(1);
  } finally { restore.reverse().forEach(fn => fn()); }
});

test('cancelled browser share does not report success or download a second file', async () => {
  const restore = [replace('indexedDB', new IDBFactory()), replace('navigator', { canShare: () => true, share: () => Promise.reject(new DOMException('Cancelled', 'AbortError')) })];
  try {
    const store = await openBrowserTimelapse(`export-cancel-${crypto.randomUUID()}`);
    store.media = async () => ({ blob: new Blob(['video']), url: 'blob:test', release() {} });
    store.deliver = async () => { throw new Error('Must not download on cancel'); };
    const prepared = await store.prepareShare!('test.mp4', 'video/mp4');
    await expect(prepared!.share()).rejects.toMatchObject({ name: 'AbortError' }); prepared?.release();
  } finally { restore.reverse().forEach(fn => fn()); }
});

test('native media fallback releases a loading decoder immediately on cancellation', async () => {
  let removed = false, sourceRemoved = false;
  class Video extends EventTarget {
    style = {}; setAttribute() {} pause() {} load() {}
    removeAttribute() { sourceRemoved = true; } remove() { removed = true; }
  }
  const restore = replace('document', { createElement: () => new Video(), body: { append() {} } });
  try {
    const controller = new AbortController();
    const opening = openVideoFrames('blob:recording', controller.signal);
    controller.abort(); await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(removed && sourceRemoved).toBe(true);
  } finally { restore(); }
});

test('new recordings prefer supported H.264 but retain browser codec fallbacks', () => {
  let supported = new Set(['video/mp4;codecs=avc1.420028', 'video/mp4']);
  const restore = replace('MediaRecorder', { isTypeSupported: (type: string) => supported.has(type) });
  try {
    expect(recordingMime()).toBe('video/mp4;codecs=avc1.420028');
    supported = new Set(['video/webm;codecs=vp8']); expect(recordingMime()).toBe('video/webm;codecs=vp8');
    supported.clear(); expect(recordingMime).toThrow('対応する録画形式');
  } finally { restore(); }
});


test('policy-blocked browser sharing offers a single download without calling native share', async () => {
  let downloads = 0, shares = 0;
  const restore = [replace('indexedDB', new IDBFactory()), replace('navigator', {
    canShare: () => true, share: async () => { shares++; },
  }), replace('setTimeout', (fn: () => void) => { fn(); return 0; }), replace('document', {
    featurePolicy: { allowsFeature: () => false },
    createElement: () => ({ click: () => { downloads++; } }),
  })];
  try {
    const store = await openBrowserTimelapse(`export-policy-${crypto.randomUUID()}`);
    store.media = async () => ({ blob: new Blob(['video']), url: 'blob:test', release() {} });
    expect(await store.prepareShare!('test.mp4', 'video/mp4')).toBeNull();
    expect(await store.deliver('test.mp4', 'video/mp4', true)).toContain('ファイルを添付');
    expect(shares).toBe(0); expect(downloads).toBe(1);
  } finally { restore.reverse().forEach(fn => fn()); }
});
