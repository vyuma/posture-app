import { activeSpace, activeOwner } from '../accounts/localScope';
import { openBrowserDriver, WorkRepository } from './repository';
import type { WidgetAction, WidgetState } from './Widget';
export const isDesktop = false;
export async function openWorkRepository(space = activeSpace(), owner = activeOwner()) { return new WorkRepository(await openBrowserDriver(space), space === 'legacy', owner); }
export async function publishWidget(_state: WidgetState | null) {}
export async function subscribeWidgetActions(_callback: (sessionId: string, action: WidgetAction) => void): Promise<() => void> { return () => {}; }
