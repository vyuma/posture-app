import { isTauri, invoke } from '@tauri-apps/api/core';
import { initialAccounts, type LocalAccounts } from './types';
const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= (async () => { const r = indexedDB.open('piiin-accounts-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('state'); return request(r); })();
}
export async function readAccounts(): Promise<LocalAccounts> {
  const value = isTauri() ? await invoke<LocalAccounts | null>('account_local_state', {}) : await request<LocalAccounts | undefined>((await db()).transaction('state').objectStore('state').get('accounts'));
  if (value) return value;
  const initial = initialAccounts();
  await compareAccounts(null, initial);
  return readAccounts();
}
async function compareAccounts(revision: number | null, value: LocalAccounts): Promise<boolean> {
  if (isTauri()) return invoke('account_local_state', { revision, value });
  const tx = (await db()).transaction('state', 'readwrite');
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); });
  const store = tx.objectStore('state'), current = await request<LocalAccounts | undefined>(store.get('accounts'));
  if ((current?.revision ?? null) !== revision) { await done; return false; }
  store.put(value, 'accounts'); await done; return true;
}
export async function updateAccounts(change: (state: LocalAccounts) => void): Promise<LocalAccounts> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readAccounts(), next = structuredClone(current); change(next); next.revision++;
    if (await compareAccounts(current.revision, next)) {
      const channel = new BroadcastChannel('piiin-accounts'); channel.postMessage('changed'); channel.close(); return next;
    }
  }
  throw new Error('別の画面でアカウントが更新されました。再試行してください。');
}
