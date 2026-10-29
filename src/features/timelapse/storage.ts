import type { Clip } from './model';
export type MediaWriter = { write(data: Uint8Array, position?: number): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
export type MediaFile = { url: string; blob?: Blob; release(): void };
// Embedded/managed browsers may expose canShare while policy still blocks share.
function canShareVideo(file: File) {
  const policy = typeof document === 'undefined' ? undefined : (document as Document & {
    permissionsPolicy?: { allowsFeature(name: string): boolean };
    featurePolicy?: { allowsFeature(name: string): boolean };
  });
  if ((policy?.permissionsPolicy ?? policy?.featurePolicy)?.allowsFeature('web-share') === false) return false;
  return typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] }));
}

export type PreparedShare = { share(): Promise<string>; release(): void };
export interface TimelapseStore {
  epoch(): Promise<number>;
  get(id: string): Promise<Clip | null>;
  put(clip: Clip): Promise<void>;
  writer(name: string, epoch: number): Promise<MediaWriter>;
  media(name: string): Promise<MediaFile>;
  remove(name: string): Promise<void>;
  clear(): Promise<void>;
  recover(): Promise<void>;
  prepareShare?(name: string, mime: string): Promise<PreparedShare | null>;
  deliver(name: string, mime: string, share: boolean): Promise<string>;
  releaseExport(name: string): Promise<void>;
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('保存に失敗しました')); });
const safe = (name: string) => { if (!/^[a-zA-Z0-9_-]+\.(mp4|webm)$/.test(name)) throw new Error('Invalid video name'); return name; };
const browserStores = new Map<string, Promise<TimelapseStore>>();
export function openBrowserTimelapse(namespace = 'piiin-timelapse'): Promise<TimelapseStore> {
  if (browserStores.has(namespace)) return browserStores.get(namespace)!;
  const opening = (async () => {
    const writers = new Set<MediaWriter>();
    const channel = new BroadcastChannel(namespace);
    channel.onmessage = () => { for (const writer of writers) void writer.abort().catch(() => {}); };
    const request = indexedDB.open(`${namespace}-v1`, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('clips', { keyPath: 'id' }); request.result.createObjectStore('meta'); };
    const db = await req(request); db.onversionchange = () => db.close();
    async function directory() {
      if (!navigator.storage?.getDirectory) throw new Error('この環境では動画を保存できません。対応ブラウザでお試しください。');
      return (await navigator.storage.getDirectory()).getDirectoryHandle(namespace, { create: true });
    }
    const epoch = async () => (await req(db.transaction('meta').objectStore('meta').get('epoch')) as number | undefined) ?? 0;
    const store: TimelapseStore = {
      epoch,
      async get(id) { return (await req(db.transaction('clips').objectStore('clips').get(id))) ?? null; },
      async put(clip) { const tx = db.transaction(['clips', 'meta'], 'readwrite'); const finish = done(tx); const current = (await req(tx.objectStore('meta').get('epoch'))) ?? 0;
        if (clip.epoch !== current) { await finish; throw new Error('コレクション初期化後の動画は保存できません'); }
        tx.objectStore('clips').put(clip); await finish;
      },
      async writer(name, generation) {
        if (generation !== await epoch()) throw new Error('動画の保存は取り消されました');
        await directory();
        const worker = new Worker(new URL('./file.worker.ts', import.meta.url), { type: 'module' });
        let sequence = 0, position = 0, closed = false, closing: Promise<void> | undefined;
        const pending = new Map<number, { resolve(): void; reject(error: Error): void }>();
        worker.onmessage = ({ data }) => { const task = pending.get(data.id); pending.delete(data.id); if (data.error) task?.reject(new Error(data.error)); else task?.resolve(); };
        worker.onerror = () => { for (const task of pending.values()) task.reject(new Error('動画保存の処理が終了しました')); pending.clear(); };
        function send(message: object) { return new Promise<void>((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); worker.postMessage({ ...message, id }); }); }
        function close() { closed = true; return closing ??= send({ type: 'close' }).finally(() => { writers.delete(writer); worker.terminate(); }); }
        const writer: MediaWriter = { async write(data, at = position) {
          if (closed) throw new Error('動画ファイルは閉じられています');
          if (generation !== await epoch()) throw new Error('動画の保存は取り消されました');
          await send({ type: 'write', data, position: at }); position = at + data.length;
        }, close, abort: close };
        writers.add(writer);
        try {
          await send({ type: 'open', directory: namespace, name: safe(name) });
          if (closed || generation !== await epoch()) { await close(); await store.remove(name); throw new Error('動画の保存は取り消されました'); }
        } catch (error) { writers.delete(writer); worker.terminate(); throw error; }
        return writer;
      },
      async media(name) { const blob = await (await (await directory()).getFileHandle(safe(name))).getFile(); const url = URL.createObjectURL(blob); return { url, blob, release: () => URL.revokeObjectURL(url) }; },
      async remove(name) { try { await (await directory()).removeEntry(safe(name)); } catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; } },
      async clear() {
        const tx = db.transaction(['meta', 'clips'], 'readwrite'); const finish = done(tx); const meta = tx.objectStore('meta');
        meta.put(((await req(meta.get('epoch'))) ?? 0) + 1, 'epoch'); tx.objectStore('clips').clear(); await finish;
        channel.postMessage('clear');
        await Promise.all([...writers].map(writer => writer.abort()));
        if (navigator.storage?.getDirectory) { const root = await navigator.storage.getDirectory();
          for (let attempt = 0; ; attempt++) { try { await root.removeEntry(namespace, { recursive: true }); break; } catch (error) {
            if (error instanceof DOMException && error.name === 'NotFoundError') break;
            if (attempt === 4) throw new Error('動画の削除を完了できませんでした。他のウィンドウを閉じて、初期化を再試行してください。');
            await new Promise(resolve => setTimeout(resolve, 200));
          } }
        }
      },
      async recover() {
        const clips = await req<Clip[]>(db.transaction('clips').objectStore('clips').getAll());
        for (const clip of clips) if (clip.state === 'recording') {
          let bytes = 0;
          try { const media = await store.media(clip.file); bytes = media.blob?.size ?? 0; media.release(); } catch { /* Missing file is shown as unavailable. */ }
          await store.put({ ...clip, bytes, state: bytes ? 'partial' : 'failed', error: '録画が途中で終了しました。保存できた範囲の映像です。' });
        }
        // Exports are disposable; original recordings are never removed by age.
        try { const dir = await directory(); for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) if (name.startsWith('export-')) await store.remove(name); } catch { /* Recording can report unsupported storage later. */ }
      },
      async prepareShare(name, mime) {
        if (!navigator.share) return null;
        const media = await store.media(name);
        const file = new File([media.blob!], `PiiiN-${new Date().toISOString().replace(/[:.]/g, '-')}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime.split(';')[0] });
        if (!canShareVideo(file)) { media.release(); return null; }
        // No asynchronous storage/encoding before share(): the next click owns a fresh gesture.
        return { share: () => navigator.share({ files: [file], title: 'PiiiN タイムラプス' }).then(() => '共有先に動画を渡しました'), release: media.release };
      },
      async deliver(name, mime, share) { const media = await store.media(name);
        try { const file = new File([media.blob!], `PiiiN-${new Date().toISOString().replace(/[:.]/g, '-')}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime.split(';')[0] });
          if (share && canShareVideo(file)) {
            try { await navigator.share({ files: [file], title: 'PiiiN タイムラプス' }); return '動画を共有しました'; }
            catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; }
            // A long composition may outlive the browser's transient share gesture.
            // Deliver the same single file as a download when the sheet cannot open.
          }
          const a = document.createElement('a'); a.href = media.url; a.download = file.name; a.click();
          return share ? '動画を保存しました。共有先にファイルを添付してください。' : '動画を保存しました';
        } finally { setTimeout(media.release, 60_000); }
      },
      // Download completion is not observable from an anchor. Keep its backing
      // file until startup recovery/reset, rather than invalidating an active download.
      async releaseExport() {},
    }; return store;
  })().catch(error => { browserStores.delete(namespace); throw error; });
  browserStores.set(namespace, opening); return opening;
}
