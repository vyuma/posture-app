import { test, expect, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
const check = mock(() => { throw new Error('Store must not check external updates'); });
mock.module('@tauri-apps/plugin-updater', () => ({ check }));
const { DesktopUpdater } = await import('../src/features/updates/DesktopUpdater');

test('Store channel has no external updater UI', () => {
  expect(import.meta.env.VITE_DISTRIBUTION_CHANNEL).toBe('mac-app-store');
  expect(renderToStaticMarkup(<DesktopUpdater canInstall={true} />)).toBe('');
  expect(check).not.toHaveBeenCalled();
});
