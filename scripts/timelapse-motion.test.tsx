import { beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '../src/features/work/model';
import { DEFAULT_TIMELAPSE } from '../src/features/timelapse/model';
import type { TimelapseStore } from '../src/features/timelapse/storage';

const browser = new Window({ url: 'https://example.test/app' });
const listeners = new Set<() => void>();
const preference = { matches: true, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, IS_REACT_ACT_ENVIRONMENT: true, matchMedia: () => preference });
mock.module('virtual:sound-options', () => ({ SOUND_OPTIONS: [] }));
mock.module('../src/features/timelapse/useClip', () => ({ useClip: () => ({ clip: { file: 'original.mp4', state: 'ready', bytes: 10 }, error: '' }) }));
const encoded: boolean[] = [];
beforeEach(() => { encoded.length = 0; preference.matches = true; });
mock.module('../src/features/timelapse/exportVideo', () => ({ exportVideo: async (_store: unknown, _clip: unknown, _settings: unknown, _id: unknown, signal: AbortSignal, _progress: unknown, reduced = false) => {
  signal.throwIfAborted(); encoded.push(reduced);
  return { name: `export-${encoded.length}-${reduced}.mp4`, mime: 'video/mp4', temporary: true };
} }));
const { TimelapseScreen } = await import('../src/features/timelapse/TimelapseScreen');

test('reduced-motion preview remains separate from saved animation and responds to preference changes', async () => {
  const released: string[] = [], delivered: string[] = [];
  const store = {
    media: async (name: string) => ({ url: `https://example.test/${name}`, release() {} }),
    releaseExport: async (name: string) => { released.push(name); },
    deliver: async (name: string) => { delivered.push(name); return ''; },
  } as unknown as TimelapseStore;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<TimelapseScreen session={{ id: 'session' } as Session} settings={{ ...DEFAULT_TIMELAPSE, includePet: true }} store={store} onClose={() => {}} onHome={() => {}} />));
    expect(encoded).toEqual([false, true]);
    expect(host.querySelector('video')!.src).toEndWith('export-2-true.mp4');
    await act(() => { host.querySelector('video')!.dispatchEvent(new browser.Event('loadeddata') as unknown as Event); });
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="動画を保存"]')!.click());
    expect(delivered).toEqual(['export-1-false.mp4']);
    await act(() => { preference.matches = false; listeners.forEach(fn => fn()); });
    expect(encoded).toEqual([false, true, false]);
    expect(host.querySelector('video')!.src).toEndWith('export-3-false.mp4');
    expect(released.sort()).toEqual(['export-1-false.mp4', 'export-2-true.mp4']);
  } finally { await act(() => root.unmount()); host.remove(); }
  expect(released).toContain('export-3-false.mp4');
  expect(listeners.size).toBe(0);
});


test('repeated preference changes retain every cleanup while a download is awaiting its save dialog', async () => {
  const released: string[] = [];
  let finishDelivery: (value: string) => void = () => {};
  const store = {
    media: async (name: string) => ({ url: `https://example.test/${name}`, release() {} }),
    releaseExport: async (name: string) => { released.push(name); },
    deliver: () => new Promise<string>(resolve => { finishDelivery = resolve; }),
  } as unknown as TimelapseStore;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<TimelapseScreen session={{ id: 'session' } as Session} settings={{ ...DEFAULT_TIMELAPSE, includePet: true }} store={store} onClose={() => {}} onHome={() => {}} />));
    await act(() => { host.querySelector('video')!.dispatchEvent(new browser.Event('loadeddata') as unknown as Event); });
    await act(() => host.querySelector<HTMLButtonElement>('[aria-label="動画を保存"]')!.click());
    await act(() => { preference.matches = false; listeners.forEach(fn => fn()); });
    await act(() => { preference.matches = true; listeners.forEach(fn => fn()); });
    expect(encoded).toEqual([false, true, false, false, true]);
    expect(released).toEqual([]);
    await act(async () => { finishDelivery(''); });
    expect(released.sort()).toEqual(['export-1-false.mp4', 'export-2-true.mp4', 'export-3-false.mp4']);
  } finally { await act(() => root.unmount()); host.remove(); }
  expect(released).toHaveLength(5);
});
