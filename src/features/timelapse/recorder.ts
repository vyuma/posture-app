import { ASSET_VERSION, petEvent, type Clip, type PetEvent } from './model';
import type { Session } from '../work/model';
import type { WidgetState } from '../work/Widget';
import type { MediaWriter, TimelapseStore } from './storage';
import { finalizeRecording } from './finalizeRecording';

export const recordingAllowed = (session: Pick<Session, 'status' | 'phase'> | null, active: boolean) => active && session?.status === 'running' && session.phase === 'focus';
export function recordingMime(): string {
  if (typeof MediaRecorder === 'undefined') throw new Error('この環境ではタイムラプスを記録できません。姿勢測定は続けられます。');
  const mime = ['video/mp4;codecs=avc1.420028', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('対応する録画形式がありません。姿勢測定は続けられます。');
  return mime;
}

/** One recorder keeps container timestamps continuous across focus intervals. */
export class TimelapseRecorder {
  private recorder?: MediaRecorder;
  private track?: MediaStreamTrack;
  private writer?: MediaWriter;
  private clip?: Clip;
  private writes = Promise.resolve();
  private pendingBytes = 0;
  private failed = false;
  private storageFailed = false;
  private closing?: Promise<void>;
  private startTask?: Promise<void>;
  private stopped = false;
  private recording = false;
  private clockStart = 0;
  private elapsed = 0;
  private desired = false;
  private latest?: WidgetState;
  private visible = true;
  private excludedPose: PetEvent['pose'] | undefined;
  private excludedHidden = false;
  constructor(private store: TimelapseStore, private notify: (message: string) => void, private changed: () => void) {}
  get seconds() { return this.elapsed + (this.recording ? (performance.now() - this.clockStart) / 1000 : 0); }
  begin(session: Session, source: MediaStream, quality: number) {
    this.startTask = this.start(session, source, quality);
    return this.startTask;
  }
  private async start(session: Session, source: MediaStream, quality: number) {
    try {
      const sourceTrack = source.getVideoTracks()[0];
      if (!sourceTrack || sourceTrack.readyState !== 'live') throw new Error('カメラ映像を記録できません。姿勢測定は続けられます。');
      this.track = sourceTrack.clone();
      const mime = recordingMime();
      const actual = this.track.getSettings();
      const epoch = await this.store.epoch();
      const file = `${session.id}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
      this.clip = { id: session.id, sessionId: session.id, generation: session.generation, epoch, state: 'recording', mime, file,
        width: actual.width ?? 1280, height: actual.height ?? 720, duration: 0, bytes: 0, createdAt: new Date().toISOString(), events: [], assetVersion: ASSET_VERSION };
      this.writer = await this.store.writer(file, epoch);
      await this.store.put(this.clip);
      if (this.stopped) { await this.writer.close(); this.track.stop(); return; }
      this.recorder = new MediaRecorder(new MediaStream([this.track]), { mimeType: mime, videoBitsPerSecond: quality === 1080 ? 4_000_000 : 2_000_000 });
      this.recorder.ondataavailable = event => this.chunk(event.data);
      this.recorder.onerror = () => this.fail('録画エラーが発生しました。保存済みの映像を残して、姿勢測定を続けます。');
      this.track.onended = () => this.fail('カメラ接続が終了したため、録画を停止しました。');
      this.track.onmute = () => this.fail('カメラ映像が途切れたため、録画を停止しました。保存済みの映像は残ります。');
      // Safari dispatches `start` after capture has already begun. Anchor to start(),
      // not that delayed event, so historical pet poses match encoded timestamps.
      this.recorder.onstart = () => this.sync();
      this.clockStart = performance.now(); this.recording = true;
      this.recorder.start(2000);
      this.sync();
      if ((actual.height ?? quality) < quality) this.notify(`タイムラプスはカメラが対応する ${actual.width}×${actual.height} で記録します。`);
      this.changed();
    } catch (error) { this.fail(error instanceof Error ? error.message : '録画を開始できませんでした。'); }
  }
  update(active: boolean, widget: WidgetState, visible: boolean) {
    this.desired = active; this.latest = widget; this.visible = visible;
    if (!active) { this.excludedPose = widget.bad ? 'bad' : 'paused'; this.excludedHidden = !visible; }
    this.sync();
  }
  private sync() {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive' || this.stopped) return;
    if (!this.desired && recorder.state === 'recording') {
      this.elapsed = this.seconds; this.recording = false; recorder.pause();
    } else if (this.desired && recorder.state === 'paused') {
      recorder.resume(); this.clockStart = performance.now(); this.recording = true;
      this.recordEvent(true);
    } else if (this.desired) this.recordEvent(false);
  }
  private recordEvent(force: boolean) {
    if (!this.clip || !this.latest) return;
    const previous = this.clip.events[this.clip.events.length - 1];
    const value = petEvent(this.seconds, this.latest, previous, this.visible, matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!previous) { value.at = 0; value.transitionAt = 0; }
    if (this.excludedPose) { value.from = this.excludedHidden ? value.pose : this.excludedPose; value.transitionAt = value.at; this.excludedPose = undefined; }
    const expected = previous ? previous.remainingMs - (value.at - previous.at) * 1000 : 0;
    // A small log, independent of the camera frame rate; periodic anchors prevent clock drift.
    if (force || !previous || previous.pose !== value.pose || previous.speech?.id !== value.speech?.id || previous.feedbackVersion !== value.feedbackVersion || previous.cycle !== value.cycle || previous.visible !== value.visible || previous.reduced !== value.reduced || Math.abs(expected - value.remainingMs) > 1000 || value.at - previous.at >= 5) this.clip.events.push(value);
  }
  private chunk(blob: Blob) {
    if (!blob.size || this.storageFailed) return;
    if (this.pendingBytes + blob.size > 32 * 1024 * 1024) { this.fail('保存が追いつかないため録画を停止しました。姿勢測定は続けられます。'); return; }
    this.pendingBytes += blob.size;
    this.writes = this.writes.then(async () => {
      try {
        for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
          const data = new Uint8Array(await blob.slice(offset, offset + 512 * 1024).arrayBuffer());
          await this.writer!.write(data); this.clip!.bytes += data.length;
        }
        this.clip!.duration = this.seconds;
        await this.store.put(structuredClone(this.clip!));
      } finally { this.pendingBytes -= blob.size; }
    }).catch(() => { this.storageFailed = true; this.fail('動画の保存容量が不足しているか、保存できませんでした。既存の動画を残して録画のみ停止します。'); });
  }
  private fail(message: string) {
    if (this.failed) return;
    this.failed = true; if (this.clip) this.clip.error = message;
    this.notify(message);
    // Queue stop after startTask resolves, avoiding a self-await during initialization failure.
    queueMicrotask(() => { void this.stop(); });
  }
  stop(): Promise<void> { return this.closing ??= this.finish(); }
  private async finish() {
    this.stopped = true;
    await this.startTask;
    this.elapsed = this.seconds; this.recording = false;
    const recorder = this.recorder;
    if (recorder && recorder.state !== 'inactive') await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { this.failed = true; resolve(); }, 5000);
      recorder.addEventListener('stop', () => { clearTimeout(timeout); resolve(); }, { once: true });
      recorder.stop();
    });
    this.track?.stop();
    await this.writes;
    try {
      await this.writer?.close();
      if (this.clip) {
        this.clip.duration = this.elapsed;
        this.clip.state = this.clip.bytes ? this.failed ? 'partial' : 'ready' : 'failed';
        if (this.clip.bytes && !this.storageFailed) {
          const original = this.clip.file;
          try {
            const completed = await finalizeRecording(this.store, this.clip);
            await this.store.put(completed); this.clip = completed;
            await this.store.remove(original);
          } catch { this.clip.state = 'partial'; this.clip.error = '映像の整理を完了できませんでした。保存できた原本を保持しています。'; }
        }
        await this.store.put(this.clip);
      }
    } catch { this.notify('動画の保存を完了できませんでした。姿勢・カードの記録は保存されます。'); }
    this.changed();
  }
}
