/** Development-only, isolated media store. Never uses a real collection or its reset. */
import { useEffect, useRef, useState } from 'react';
import { createSession, DEFAULT_TIMER, type Baseline, type Session } from '../work/model';
import { DEFAULT_TIMELAPSE, type Clip } from './model';
import { openTimelapseTestStore, canResizeTimelapsePreview, resizeTimelapsePreview } from './platform';
import type { TimelapseStore } from './storage';
import { TimelapseRecorder } from './recorder';
import { TimelapseScreen } from './TimelapseScreen';
import { TimelapseSettings } from './TimelapseSettings';
import { ResultCard } from '../work/ResultCard';
import { ResultScreen } from '../work/ResultScreen';
import { openVideoFrames } from './videoFrames';
import { exportVideo } from './exportVideo';
import '../../styles/base.css';
import '../work/work.css';

import '../work/responsive-layout.css';
import { FeedbackSpeech } from '../posture/feedbackSpeech';
const newSession = () => createSession(`qa-${crypto.randomUUID()}`, { ...DEFAULT_TIMER, focusMinutes: 1, cycles: 2 }, 0, { stats: {}, headWidthRatio: null } as Baseline);
export default function TimelapsePreview() {
  const [session, setSession] = useState<Session>(() => { try { return JSON.parse(sessionStorage.getItem('piiin.timelapse.qa-session') ?? 'null') ?? newSession(); } catch { return newSession(); } }), [store, setStore] = useState<TimelapseStore>();
  const [clip, setClip] = useState<Clip | null>(null), [settings, setSettings] = useState(() => structuredClone(DEFAULT_TIMELAPSE));
  const [screen, setScreen] = useState<'controls' | 'video' | 'card' | 'result'>('controls'), [config, setConfig] = useState(false);
  const [busy, setBusy] = useState(false), [report, setReport] = useState('QA storage only. 18s source → 12s focus video.');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { void openTimelapseTestStore().then(async value => { setStore(value); const saved = await value.get(session.id); if (saved) { setClip(saved); setReport(JSON.stringify(saved, null, 2)); } }).catch(error => setReport(String(error))); return () => controller.current?.abort(); }, []);
  async function run(camera: boolean, long = false) {
    if (!store) return; setBusy(true); setReport('Recording…');
    controller.current = new AbortController(); const signal = controller.current.signal;
    const next = newSession(); next.acquiredCharacterId = 'oto-anago'; next.focusMs = 12_000; next.status = 'completed'; next.endedAt = new Date().toISOString(); setSession(next);
    const target = document.createElement('canvas'); target.width = settings.quality === 1080 ? 1920 : 1280; target.height = settings.quality;
    const ctx = target.getContext('2d')!;
    let source: MediaStream | undefined, recorder: TimelapseRecorder | undefined;
    const sourceSession = { ...next, status: 'running' as const };
    try {
      source = camera ? await new Promise<MediaStream>((resolve, reject) => {
        let ended = false;
        const cancel = () => { ended = true; reject(new Error('カメラを取得できませんでした（権限待ち・中止）')); };
        const timeout = setTimeout(cancel, 15_000); signal.addEventListener('abort', cancel, { once: true });
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: target.width }, height: { ideal: target.height } }, audio: false }).then(stream => { if (ended) stream.getTracks().forEach(track => track.stop()); else resolve(stream); }, reject).finally(() => { clearTimeout(timeout); signal.removeEventListener('abort', cancel); });
      }) : target.captureStream(30);
      if (camera) {
        // Production records an already-running posture camera. Warm the test
        // track to its first frame too, instead of measuring camera startup latency.
        const preview = document.createElement('video'); preview.muted = true; preview.playsInline = true; preview.srcObject = source;
        try { await preview.play(); await new Promise<void>(resolve => preview.requestVideoFrameCallback(() => resolve())); }
        finally { preview.pause(); preview.srcObject = null; }
      }
      recorder = new TimelapseRecorder(store, message => setReport(message), () => {});
      let stage = 'FOCUS', started = performance.now(), badSince: number | null = null;
      const feedback = new FeedbackSpeech();
      const total = long ? 180 : 18;
      const update = () => {
        const elapsed = (performance.now() - started) / 1000, local = elapsed % 18;
        const active = local < 4 || (local >= 6 && local < 10) || (local >= 12 && local < 14) || local >= 16;
        stage = active ? 'FOCUS' : local < 6 ? 'REST' : local < 12 ? 'PAUSE' : 'CALIBRATE';
        const bad = active && ((local >= 2 && local < 4) || (local >= 8 && local < 10));
        badSince = bad ? badSince ?? Date.now() : null;
        ctx.fillStyle = active ? bad ? '#da8658' : '#7fb7d0' : '#d03168'; ctx.fillRect(0, 0, target.width, target.height);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${target.height * .07}px sans-serif`; ctx.fillText(`${stage} · source ${elapsed.toFixed(2)}s`, target.width * .08, target.height * .25);
        ctx.font = `${target.height * .04}px sans-serif`; ctx.fillText(`FOCUS only · ${bad ? 'BAD → grow / shake' : 'GOOD'} · cycle ${local < 6 ? 1 : 2}`, target.width * .08, target.height * .38);
        ctx.beginPath(); ctx.arc(target.width * (.15 + elapsed % 3 / 4), target.height * .65, target.height * .1, 0, Math.PI * 2); ctx.fill();
        const now = Date.now();
        const speech = feedback.update({ context: next.id, mode: active ? 'focus' : stage === 'REST' ? 'rest' : 'paused', now, observedAt: now, maxAge: 1500, valid: true, posture: bad ? 'bad' : 'good', evidence: { faceNear: bad && local < 4 ? 2 : 0, headTilt: bad && local >= 8 ? 2 : 0, bodyTilt: 0, headForward: 0 } });
        recorder!.update(active, { sessionId: next.id, phase: stage === 'REST' ? 'rest' : 'focus', paused: !active, bad, badSince, remainingMs: 60_000 - (local < 6 ? local : local - 6) * 1000, durationMs: 60_000, cycle: local < 6 ? 1 : 2, cycles: 2, feedbackVersion: 1, speech }, true);
        setReport(`${stage}: ${elapsed.toFixed(1)} / ${total}s; recording clock ${recorder!.seconds.toFixed(2)}s`);
      };
      update(); await recorder.begin(sourceSession, source, settings.quality); started = performance.now(); update();
      const timer = setInterval(update, 40);
      try { await new Promise<void>(resolve => { const timeout = setTimeout(resolve, total * 1000); signal.addEventListener('abort', () => { clearTimeout(timeout); resolve(); }, { once: true }); }); }
      finally { clearInterval(timer); }
      setReport('Finalizing and rebuilding seek metadata…'); await recorder.stop();
      const result = await store.get(next.id); setClip(result); sessionStorage.setItem('piiin.timelapse.qa-session', JSON.stringify(next)); setReport(JSON.stringify(result, null, 2));
    } catch (error) { setReport(String(error)); await recorder?.stop(); }
    finally { source?.getTracks().forEach(track => track.stop()); setBusy(false); }
  }
  async function inspectCodecs() {
    if (!store || !clip) return;
    const media = await store.media(clip.file), bunny = await import('mediabunny');
    const input = new bunny.Input({ source: media.blob ? new bunny.BlobSource(media.blob) : new bunny.UrlSource(media.url), formats: bunny.ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack(), config = await track?.getDecoderConfig();
      const video = document.createElement('video');
      setReport(JSON.stringify({ mime: clip.mime, codec: await track?.getCodecParameterString(), config: { ...config, description: config?.description?.byteLength }, canDecode: await track?.canDecode(), htmlPlayback: video.canPlayType(clip.mime), videoDecoder: typeof VideoDecoder, videoEncoder: typeof VideoEncoder, avcEncoder: await bunny.canEncodeVideo('avc', { width: clip.width, height: clip.height }), webShare: typeof navigator.share, fileShare: navigator.canShare?.({ files: [new File(['qa'], 'qa.mp4', { type: 'video/mp4' })] }) }, null, 2));
    } catch (error) { setReport(String(error)); }
    finally { input.dispose(); media.release(); }
  }
  async function verifyExports() {
    if (!store || !clip) return; setBusy(true); const rows: object[] = [];
    controller.current = new AbortController();
    try {
      const bunny = await import('mediabunny');
      for (const [includePet, includeScene] of [[false, false], [true, false], [false, true], [true, true]]) {
        setReport(`Exporting pet=${includePet}, scene=${includeScene}…`);
        const output = await exportVideo(store, clip, { ...settings, includePet, includeScene }, session.acquiredCharacterId, controller.current.signal, value => setReport(`Exporting pet=${includePet}, scene=${includeScene}: ${(value * 100).toFixed(0)}%`));
        const media = await store.media(output.name);
        const input = new bunny.Input({ source: media.blob ? new bunny.BlobSource(media.blob) : new bunny.UrlSource(media.url), formats: bunny.ALL_FORMATS });
        try {
          const track = await input.getPrimaryVideoTrack();
          const duration = await input.computeDuration();
          if (!track) throw new Error('No video track');
          const canDecode = await track.canDecode();
          const sink = canDecode ? new bunny.VideoSampleSink(track) : null;
          const frames = canDecode ? null : await openVideoFrames(media.url, controller.current.signal);
          const seekFrames = [];
          try {
            for (const at of [0, 2.5, 4.2, 6.5, Math.max(0, duration - .2)]) {
              const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
              const ctx = canvas.getContext('2d')!;
              let decoded: number;
              if (sink) {
                const sample = await sink.getSample(at);
                if (!sample) throw new Error(`No video sample at ${at}s`);
                try { sample.draw(ctx, 0, 0, 1, 1); decoded = sample.timestamp; }
                finally { sample.close(); }
              } else {
                const frame = await frames!.at(at);
                ctx.drawImage(frame, 0, 0, 1, 1); decoded = frame.currentTime;
              }
              const pixel = [...ctx.getImageData(0,0,1,1).data];
              if (pixel[3] !== 255) throw new Error(`No decoded pixels at ${at}s`);
              seekFrames.push({ requested: at, decoded, pixel });
            }
          } finally { frames?.dispose(); }
          const audioTracks = (await input.getAudioTracks()).length;
          if (audioTracks !== 0 || Math.abs(duration - clip.duration) > .05) throw new Error('Export changed the source duration or added audio');
          rows.push({ includePet, includeScene, file: output.name, mime: output.mime, duration, audioTracks, width: track?.displayWidth, height: track?.displayHeight, seekFrames });
        } finally { input.dispose(); media.release(); }
      }
      setReport(JSON.stringify(rows.map(row => { const result = row as { includePet: boolean; includeScene: boolean; duration: number; width: number; height: number; seekFrames: object[] }; return { pet: result.includePet, scene: result.includeScene, seconds: result.duration, size: [result.width, result.height], decodedFrames: result.seekFrames.length, silent: true, passed: true }; })));
    } catch (error) { setReport(`${JSON.stringify(rows)}\n${String(error)}`); }
    finally { setBusy(false); }
  }
  function inspectAndClose() {
    const elements = ['.timelapse-screen', '.timelapse-panel', '.timelapse-player', '.timelapse-side.left', '.timelapse-side.right'];
    const rows = elements.map(selector => {
      const element = document.querySelector<HTMLElement>(selector)!;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height, transform: style.transform, opacity: style.opacity, loaded: element instanceof HTMLImageElement ? element.complete && element.naturalWidth > 0 : undefined };
    });
    const video = document.querySelector('video');
    setReport(JSON.stringify({ viewport: [innerWidth, innerHeight], video: [video?.readyState, video?.currentTime, video?.paused], elements: rows.map(row => [row.selector.replace('.timelapse-', ''), ...[row.x,row.y,row.width,row.height].map(Math.round), row.loaded, row.transform]) }));
    setScreen('controls');
  }
  if (screen === 'result' && store) return <div className="work-app"><ResultScreen session={session} timelapseStore={store} onTimelapse={() => setScreen('video')} onHome={() => setScreen('controls')} /></div>;
  if (screen === 'video' && store) return <div className="work-app"><TimelapseScreen session={session} settings={settings} store={store} onClose={inspectAndClose} onHome={() => setScreen('controls')} /></div>;
  return <div className="work-app" style={{ minHeight: '100vh', padding: 24, background: '#d9eef6' }}><h1>Timelapse QA</h1><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
    <a href="/dev/timelapse">QAを再読み込み</a> <a href="/dev/work">ホームの表示検証</a>{canResizeTimelapsePreview && [[1512,982],[1200,780],[720,540]].map(([width,height]) => <button key={width} onClick={() => void resizeTimelapsePreview(width,height).catch(error => setReport(String(error)))}>{width}×{height}</button>)}
    <button disabled={busy || !store} onClick={() => void run(false)}>シーケンステスト（18秒）</button><button disabled={busy || !store} onClick={() => void run(true)}>カメラでテスト（18秒）</button><button disabled={busy || !store} onClick={() => void run(false, true)}>長時間テスト（3分）</button>
    <button onClick={() => controller.current?.abort()} disabled={!busy}>中止</button><button onClick={() => setConfig(true)}>設定</button><button disabled={!clip} onClick={() => setScreen('video')}>再生画面</button><button onClick={() => setScreen('result')}>結果画面</button><button onClick={() => setScreen(screen === 'card' ? 'controls' : 'card')}>コレクションカード</button>
    <button disabled={!clip || busy} onClick={() => void inspectCodecs()}>コーデック診断</button><button disabled={!clip || busy} onClick={() => void verifyExports()}>全4構成を書き出して検証</button><button disabled={busy} onClick={() => setSession({ ...session, acquiredCharacterId: session.acquiredCharacterId ? null : 'yozora-nago' })}>獲得・未獲得を切り替え</button>
    <button disabled={busy || !store} onClick={() => { void store?.clear().then(() => { setClip(null); setReport('QA videos deleted'); }); }}>QA動画のみ削除</button>
  </div>{screen === 'card' && <div style={{ marginTop: 24 }}><ResultCard timelapseStore={store} session={session} variant="collection" onTimelapse={() => setScreen('video')} /></div>}
    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%', fontSize: 13 }} aria-live="polite">{report}</pre>
    {config && <TimelapseSettings value={settings} onChange={setSettings} onClose={() => setConfig(false)} />}
  </div>;
}
