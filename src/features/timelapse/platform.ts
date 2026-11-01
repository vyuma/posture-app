import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { openBrowserTimelapse, type TimelapseStore } from './storage';
function makeNativeStore(qa = false): TimelapseStore {
const call = <T>(operation: string, payload?: unknown) => invoke<T>('timelapse_store', { operation, payload: payload ?? null, qa });
return {
  epoch: () => call('epoch'), get: id => call('get', { id }), put: clip => call('put', { clip }),
  async writer(name, epoch) {
    await call('create', { name, epoch }); let position = 0, closed = false;
    return { async write(data, at = position) {
      if (closed) throw new Error('動画ファイルは閉じられています');
      for (let offset = 0; offset < data.length; offset += 512 * 1024) {
        const part = data.subarray(offset, offset + 512 * 1024); let binary = '';
        for (let index = 0; index < part.length; index += 8192) binary += String.fromCharCode(...part.subarray(index, index + 8192));
        await call('write', { name, epoch, position: at + offset, data: btoa(binary) });
      }
      position = at + data.length;
    }, async close() { closed = true; }, async abort() { closed = true; } };
  },
  async media(name) { return { url: convertFileSrc(await call<string>('path', { name })), release() {} }; },
  remove: name => call('remove', { name }), clear: () => call('clear'), recover: () => call('recover'),
  releaseExport: name => call('remove', { name }),
  async deliver(name, _mime, share) {
    if (share) { const result = await call<{ path: string; shared: boolean }>('share', { name }); return result.shared ? '共有メニューを開きました。共有先を選んでください。' : `動画を保存しました。共有先にファイルを添付してください。\n${result.path}`; }
    const path = await call<string | null>('deliver', { name }); return path ? `動画を保存しました。\n${path}` : '';
  },
};
}
const nativeStore = makeNativeStore();
const testStore = makeNativeStore(true);
export const openTimelapseStore = async () => isTauri() ? nativeStore : openBrowserTimelapse();
export const openTimelapseTestStore = async () => isTauri() ? testStore : openBrowserTimelapse('piiin-timelapse-qa');
export const canResizeTimelapsePreview = isTauri();
export const resizeTimelapsePreview = (width: number, height: number) => invoke('work_preview_window', { width, height });
