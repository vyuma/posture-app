import { useSyncExternalStore } from 'react';
import type { AppLanguage } from '../../../shared/account';
export type { AppLanguage } from '../../../shared/account';
export const LANGUAGE_KEY = 'piiin-display-language';
export const languages = [{ value: 'ja', label: '日本語' }, { value: 'ko', label: '한국어' }, { value: 'en', label: 'English' }] as const;
const valid = (value: unknown): value is AppLanguage => value === 'ja' || value === 'ko' || value === 'en';
let current: AppLanguage = 'ja';
try { const requested = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lang');
  const saved = valid(requested) ? requested : localStorage.getItem(LANGUAGE_KEY);
  if (valid(requested)) localStorage.setItem(LANGUAGE_KEY, requested); if (valid(saved)) current = saved; } catch { /* The Japanese default also works with storage disabled. */ }
const listeners = new Set<() => void>();
function apply(value: AppLanguage) {
  if (current === value) return;
  current = value;
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  listeners.forEach(listener => listener());
}
if (typeof document !== 'undefined') document.documentElement.lang = current;
export function getAppLanguage(): AppLanguage { return current; }
export function setAppLanguage(value: AppLanguage) {
  if (!valid(value)) throw new Error('Unsupported language');
  localStorage.setItem(LANGUAGE_KEY, value);
  apply(value);
}
function changed(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== localStorage) return;
  if (event.key === LANGUAGE_KEY || event.key === null) apply(valid(event.newValue) ? event.newValue : 'ja');
}
export function subscribeAppLanguage(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', changed);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener('storage', changed); };
}
export function useAppLanguage() { return useSyncExternalStore(subscribeAppLanguage, getAppLanguage, () => 'ja' as AppLanguage); }
