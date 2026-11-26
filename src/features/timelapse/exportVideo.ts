import { openVideoFrames } from './videoFrames';
import { createComposition } from './composition';
import { timelapseTimeline } from './timeline';
import type { Clip, TimelapseSettings } from './model';
import type { TimelapseStore } from './storage';

export async function exportVideo(store: TimelapseStore, clip: Clip, settings: TimelapseSettings, acquiredId: string | null | undefined, signal: AbortSignal, progress: (value: number) => void, suppressMotion = false) {
  signal.throwIfAborted();
  const media = await store.media(clip.file);
  let cleanup: (() => void) | undefined;
  try {
  const bunny = await import('mediabunny');
  const input = new bunny.Input({ source: media.blob ? new bunny.BlobSource(media.blob) : new bunny.UrlSource(media.url), formats: bunny.ALL_FORMATS });
  cleanup = () => input.dispose();
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('動画の映像が見つかりませんでした。');
  const first = await track.getFirstTimestamp();
  const end = await input.computeDuration();
  const timeline = timelapseTimeline(end - first);
  // Only short, uncomposed recordings can bypass the one-minute encoder.
  if (end <= 60 && !settings.includePet && !settings.includeScene && settings.camera.x === 0 && settings.camera.y === 0 && settings.camera.width === 1 && settings.camera.height === 1) {
    return { name: clip.file, mime: clip.mime.split(';')[0], temporary: false };
  }
  signal.throwIfAborted();
  const height = Math.min(clip.height, 1080);
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  const canvas = document.createElement('canvas'); canvas.height = even(height); canvas.width = even(height * (settings.includeScene ? 1512 / 982 : clip.width / clip.height));
  const codec = await bunny.canEncodeVideo('avc', { width: canvas.width, height: canvas.height }) ? 'avc' : await bunny.canEncodeVideo('vp8', { width: canvas.width, height: canvas.height }) ? 'vp8' : null;
  if (!codec) { throw new Error('この環境では動画を作成できません。録画原本は保持されています。'); }
  const mime = codec === 'avc' ? 'video/mp4' : 'video/webm';
  const name = `export-${crypto.randomUUID()}.${codec === 'avc' ? 'mp4' : 'webm'}`;
  const writer = await store.writer(name, clip.epoch);
  const output = new bunny.Output({ format: codec === 'avc' ? new bunny.Mp4OutputFormat({ fastStart: 'fragmented' }) : new bunny.WebMOutputFormat(), target: new bunny.StreamTarget(new WritableStream({ async write(chunk) {
    signal.throwIfAborted(); for (let offset = 0; offset < chunk.data.length; offset += 512 * 1024) await writer.write(chunk.data.subarray(offset, offset + 512 * 1024), chunk.position + offset);
  } }), { chunked: true, chunkSize: 512 * 1024 }) });
  let composition: Awaited<ReturnType<typeof createComposition>> | undefined;
  try {
    signal.throwIfAborted();
    composition = await createComposition(clip, settings, acquiredId, settings.includeScene);
    const source = new bunny.CanvasSource(canvas, { codec, bitrate: height >= 1080 ? 4_000_000 : 2_000_000 });
    output.addVideoTrack(source); await output.start();
    let lastProgressAt = 0;
    async function addFrame(frame: typeof timeline.frames[number], draw: Parameters<NonNullable<typeof composition>['paint']>[4]) {
      signal.throwIfAborted();
      composition!.paint(canvas.getContext('2d')!, canvas.width, canvas.height, frame.sourceAt, draw, suppressMotion);
      await source.add(frame.at, frame.duration);
      if (performance.now() - lastProgressAt > 200) { progress(Math.min(.99, (frame.at + frame.duration) / timeline.duration)); lastProgressAt = performance.now(); await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    if (await track.canDecode()) {
      const sink = new bunny.VideoSampleSink(track);
      let index = 0;
      for await (const sample of sink.samplesAtTimestamps(timeline.frames.map(frame => first + frame.sourceAt))) {
        if (!sample) throw new Error('動画のフレームを読み込めませんでした。');
        try { await addFrame(timeline.frames[index++], (ctx, x, y, w, h) => sample.draw(ctx, x, y, w, h)); }
        finally { sample.close(); }
      }
      if (index !== timeline.frames.length) throw new Error('動画の読み込みが途中で終了しました。');
    } else {
      // Decode offscreen once per output frame, never seek the visible player.
      const frames = await openVideoFrames(media.url, signal);
      try {
        for (const frame of timeline.frames) {
          const image = await frames.at(first + frame.sourceAt);
          await addFrame(frame, (ctx, x, y, w, h) => ctx.drawImage(image, x, y, w, h));
        }
      } finally { frames.dispose(); }
    }
    source.close(); await output.finalize(); await writer.close(); signal.throwIfAborted(); progress(1);
    return { name, mime, temporary: true };
  } catch (error) { await output.cancel().catch(() => {}); await writer.abort().catch(() => {}); await store.remove(name).catch(() => {}); throw error; }
  finally { composition?.dispose(); }
  } finally { cleanup?.(); media.release(); }
}
