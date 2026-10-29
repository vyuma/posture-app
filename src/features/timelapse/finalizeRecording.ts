import type { Clip } from './model';
import type { TimelapseStore } from './storage';

/** Rebuild duration/seek metadata by copying encoded packets, never decoding a whole movie. */
export async function finalizeRecording(store: TimelapseStore, clip: Clip): Promise<Clip> {
  const bunny = await import('mediabunny');
  const media = await store.media(clip.file);
  let cleanup: (() => void) | undefined;
  try {
  const input = new bunny.Input({ source: media.blob ? new bunny.BlobSource(media.blob) : new bunny.UrlSource(media.url), formats: bunny.ALL_FORMATS });
  cleanup = () => input.dispose();
  const file = `${clip.id}-ready.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`;
  const writer = await store.writer(file, clip.epoch);
  let bytes = 0;
  const output = new bunny.Output({ format: clip.mime.includes('mp4') ? new bunny.Mp4OutputFormat({ fastStart: 'fragmented' }) : new bunny.WebMOutputFormat(), target: new bunny.StreamTarget(new WritableStream({ async write(chunk) {
    for (let offset = 0; offset < chunk.data.length; offset += 512 * 1024) await writer.write(chunk.data.subarray(offset, offset + 512 * 1024), chunk.position + offset);
    bytes = Math.max(bytes, chunk.position + chunk.data.length);
  } }), { chunked: true, chunkSize: 512 * 1024 }) });
  try {
    const duration = await input.computeDuration();
    const conversion = await bunny.Conversion.init({ input, output, audio: { discard: true } });
    if (!conversion.isValid) throw new Error('録画ファイルを読み込めませんでした');
    await conversion.execute(); await writer.close();
    // Do not call a video complete if the camera silently lost a substantial interval.
    const mismatch = Math.abs(duration - clip.duration) > Math.min(1, Math.max(.25, clip.duration * .01));
    return { ...clip, file, bytes, duration, state: mismatch ? 'partial' : clip.state, error: mismatch ? 'カメラの記録時間に差があります。保存できた範囲の映像です。' : clip.error };
  } catch (error) { await output.cancel().catch(() => {}); await writer.abort().catch(() => {}); await store.remove(file).catch(() => {}); throw error; }
  } finally { cleanup?.(); media.release(); }
}
