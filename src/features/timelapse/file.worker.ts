/// <reference lib="webworker" />
// A sync OPFS handle flushes each bounded chunk, without keeping a whole movie in memory.
type Handle = { write(data: Uint8Array, options: { at: number }): number; flush(): void; close(): void; truncate(size: number): void };
let handle: Handle | undefined;
let fallback: FileSystemWritableFileStream | undefined;
let queue = Promise.resolve();
self.onmessage = ({ data: message }) => {
  queue = queue.then(async () => {
    try {
      if (message.type === 'open') {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(message.directory, { create: true });
        const file = await dir.getFileHandle(message.name, { create: true });
        const syncFile = file as FileSystemFileHandle & { createSyncAccessHandle?: () => Promise<Handle> };
        if (syncFile.createSyncAccessHandle) { handle = await syncFile.createSyncAccessHandle(); handle.truncate(0); }
        else fallback = await file.createWritable();
      } else if (message.type === 'write') {
        if (handle) {
          let written = 0;
          while (written < message.data.length) {
            const count = handle.write(message.data.subarray(written), { at: message.position + written });
            if (!count) throw new Error('動画を書き込めませんでした');
            written += count;
          }
          handle.flush();
        } else if (fallback) await fallback.write({ type: 'write', position: message.position, data: message.data });
        else throw new Error('動画ファイルは閉じられています');
      } else if (message.type === 'close') {
        if (handle) { handle.flush(); handle.close(); handle = undefined; }
        if (fallback) { await fallback.close(); fallback = undefined; }
      }
      self.postMessage({ id: message.id });
    } catch (error) { self.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
export {};
