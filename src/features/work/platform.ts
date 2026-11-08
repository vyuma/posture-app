import { activeSpace, activeOwner } from '../accounts/localScope';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openBrowserDriver, WorkRepository, type WorkDriver } from './repository';
import type { WidgetAction, WidgetState } from './Widget';
export const isDesktop = isTauri();
export async function openWorkRepository(space = activeSpace(), owner = activeOwner()) {
  if (!isDesktop) return new WorkRepository(await openBrowserDriver(space), space === 'legacy', owner);
  const call = <T>(operation: string, payload?: unknown) => invoke<T>('work_database', { operation, payload: payload ?? null, space });
  const driver: WorkDriver = {
    list: () => call('list'), setAnalysis: (id, analysis) => call('analysis', { id, analysis }),
    collection: () => call('collection'), session: id => call('session', { id }), interrupted: () => call('interrupted'),
    checkpoint: session => call('checkpoint', { session }), compareAndSet: (revision, collection, session) => call('commit', { revision, collection, session: session ?? null }),
  };
  return new WorkRepository(driver, space === 'legacy', owner);
}
export async function publishWidget(state: WidgetState | null) { if (isDesktop) await invoke('work_widget_update', { value: state }); }
export async function subscribeWidgetActions(callback: (sessionId: string, action: WidgetAction) => void): Promise<() => void> {
  if (!isDesktop) return () => {};
  return listen<{ sessionId: string; action: WidgetAction }>('work:action', event => callback(event.payload.sessionId, event.payload.action));
}
