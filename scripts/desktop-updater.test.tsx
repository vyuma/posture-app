import { beforeEach, afterEach, test, expect, mock } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const browser = new Window({ url: 'http://localhost', settings: { navigator: { userAgent: 'Mac' } } });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, IS_REACT_ACT_ENVIRONMENT: true });
let onCheck: (() => void) | undefined;
let native = true;
const dispose = mock(() => {});
const check = mock(async (): Promise<any> => null);
const relaunch = mock(async () => {});
mock.module('@tauri-apps/api/core', () => ({ isTauri: () => native }));
mock.module('@tauri-apps/api/event', () => ({ listen: async (_event: string, callback: () => void) => { onCheck = callback; return dispose; } }));
mock.module('@tauri-apps/plugin-updater', () => ({ check }));
mock.module('@tauri-apps/plugin-process', () => ({ relaunch }));
const { DesktopUpdater } = await import('../src/features/updates/DesktopUpdater');
let root: Root;
let host: HTMLElement;
beforeEach(() => {
  native = true;
  onCheck = undefined;
  check.mockReset(); relaunch.mockClear(); dispose.mockClear();
  check.mockResolvedValue(null);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
const render = (canInstall: boolean) => act(() => root.render(<DesktopUpdater canInstall={canInstall} />));
const trigger = () => act(async () => { onCheck?.(); });
const button = (text: string) => Array.from(host.querySelectorAll('button')).find((item) => item.textContent === text)!;

test('updates wait until home and never install during measurement', async () => {
  const install = mock(async () => {});
  check.mockResolvedValue({ version: '0.1.2', close: async () => {}, downloadAndInstall: install });
  await render(false); await trigger();
  expect(host.querySelector('dialog')!.open).toBe(false);
  await act(() => button('更新して再起動').click());
  expect(install).not.toHaveBeenCalled();
  await render(true);
  expect(host.querySelector('dialog')!.open).toBe(true);
  await act(async () => button('更新して再起動').click());
  expect(install).toHaveBeenCalledTimes(1);
  expect(relaunch).toHaveBeenCalledTimes(1);
});

test('failed download or invalid signature never restarts and can be retried', async () => {
  const close = mock(async () => {});
  check.mockResolvedValue({ version: '0.1.2', close, downloadAndInstall: async () => { throw new Error('invalid signature'); } });
  await render(true); await trigger();
  await act(async () => button('更新して再起動').click());
  expect(relaunch).not.toHaveBeenCalled();
  expect(host.textContent).toContain('更新を完了できませんでした');
  check.mockResolvedValue(null);
  await act(async () => button('再確認').click());
  expect(close).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('最新バージョン');
});

test('installation prevents dismissal and duplicate installs', async () => {
  let finish!: () => void;
  const install = mock(() => new Promise<void>((resolve) => { finish = resolve; }));
  check.mockResolvedValue({ version: '0.1.2', close: async () => {}, downloadAndInstall: install });
  await render(true); await trigger();
  await act(() => button('更新して再起動').click());
  const event = new browser.Event('cancel', { cancelable: true });
  host.querySelector('dialog')!.dispatchEvent(event as unknown as Event);
  expect(event.defaultPrevented).toBe(true);
  expect(host.querySelectorAll('button').length).toBe(0);
  await trigger();
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(install).toHaveBeenCalledTimes(1);
});

test('browser previews never register native update actions', async () => {
  native = false;
  await render(true);
  expect(onCheck).toBeUndefined();
  expect(check).not.toHaveBeenCalled();
});
