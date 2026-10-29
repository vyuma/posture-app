import { useEffect, useRef, useState } from 'react';
import { Brand } from '../work/Home';
import { Icon } from '../work/Dialog';
import { character } from '../work/CharacterCard';
import type { Session } from '../work/model';
import { SPEEDS, videoTime, type TimelapseSettings } from './model';
import { useClip } from './useClip';
import { openTimelapseStore } from './platform';
import type { MediaFile, PreparedShare, TimelapseStore } from './storage';
import { createComposition } from './composition';
import { exportVideo } from './exportVideo';
import './timelapse.css';

export function TimelapseScreen({ session, settings, onClose, onHome, store: supplied }: { session: Session; settings: TimelapseSettings; onClose: () => void; onHome: () => void; store?: TimelapseStore }) {
  const { clip, error: loadError } = useClip(session.id, supplied);
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState(''), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0), [duration, setDuration] = useState(0), [speed, setSpeed] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'play' | 'pause'; key: number } | null>(null);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState<number | null>(null);
  const prepared = useRef<PreparedShare | null>(null);
  const [shareReady, setShareReady] = useState(false), [sharing, setSharing] = useState(false);
  const sharingNow = useRef(false);
  const [seeking, setSeeking] = useState(false);
  const feedbackTimer = useRef(0), exportController = useRef<AbortController | null>(null), toggling = useRef(false);
  const playable = clip && ['ready', 'partial'].includes(clip.state) && clip.bytes > 0;
  useEffect(() => {
    if (!playable || !clip) return;
    let cancelled = false, media: MediaFile | undefined;
    setReady(false); setError('');
    void (async () => { const store = supplied ?? await openTimelapseStore(); media = await store.media(clip.file); if (cancelled) { media.release(); return; } setSource(media.url); setDuration(clip.duration); })().catch(() => { if (!cancelled) setError('動画ファイルを読み込めませんでした。'); });
    return () => { cancelled = true; video.current?.pause(); media?.release(); };
  }, [clip?.file, playable, supplied]);
  useEffect(() => {
    if (!clip || !source) return;
    let cancelled = false, frame = 0, removeListeners: (() => void) | undefined;
    let composition: Awaited<ReturnType<typeof createComposition>> | undefined;
    void createComposition(clip, settings).then(value => {
      if (cancelled) { value.dispose(); return; } composition = value;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const draw = () => {
        cancelAnimationFrame(frame);
        const media = video.current, output = canvas.current;
        if (media && output && media.readyState >= 2) {
          const context = output.getContext('2d')!;
          value.paint(context, output.width, output.height, media.currentTime, (ctx, x, y, w, h) => ctx.drawImage(media, x, y, w, h), reduced.matches);
        }
        if (media && !media.paused && !media.ended) frame = requestAnimationFrame(draw);
      };
      const media = video.current;
      const events = ['loadeddata', 'play', 'pause', 'seeked', 'ended'];
      events.forEach(event => media?.addEventListener(event, draw)); reduced.addEventListener('change', draw);
      removeListeners = () => { events.forEach(event => media?.removeEventListener(event, draw)); reduced.removeEventListener('change', draw); };
      draw();
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : '動画を表示できませんでした'); });
    return () => { cancelled = true; cancelAnimationFrame(frame); removeListeners?.(); composition?.dispose(); };
  }, [clip?.file, source, settings]);
  useEffect(() => () => { clearTimeout(feedbackTimer.current); exportController.current?.abort(); prepared.current?.release(); }, []);
  async function toggle() {
    const media = video.current; if (!media || !ready || toggling.current || seeking || progress !== null) return;
    toggling.current = true;
    try {
      let kind: 'play' | 'pause';
      if (media.paused) { if (media.ended || media.currentTime >= duration) media.currentTime = 0; await media.play(); kind = 'play'; }
      else { media.pause(); kind = 'pause'; }
      setError(''); clearTimeout(feedbackTimer.current); setFeedback({ kind, key: performance.now() });
      feedbackTimer.current = window.setTimeout(() => setFeedback(null), 620);
    } catch { setError('再生を開始できませんでした。もう一度、映像を押してください。'); }
    finally { toggling.current = false; }
  }
  function changeSpeed() {
    if (!video.current) return; const next = (speed + 1) % SPEEDS.length;
    try { video.current.playbackRate = SPEEDS[next]; setSpeed(next); } catch { setError('この環境では、この再生速度を使用できません。'); }
  }
  async function sharePrepared() {
    if (!prepared.current || sharingNow.current) return;
    sharingNow.current = true; setSharing(true); setError('');
    try {
      setNotice(await prepared.current.share());
      prepared.current?.release(); prepared.current = null; setShareReady(false);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setNotice('共有をキャンセルしました。もう一度、共有先を選べます。');
      else setError('共有メニューを開けませんでした。再試行するか、保存ボタンで動画を保存してください。');
    } finally { sharingNow.current = false; setSharing(false); }
  }
  async function deliver(share: boolean) {
    if (!clip || exportController.current || sharingNow.current) return;
    prepared.current?.release(); prepared.current = null; setShareReady(false);
    video.current?.pause(); setProgress(0); setError(''); setNotice('');
    const controller = new AbortController(); exportController.current = controller;
    let output: Awaited<ReturnType<typeof exportVideo>> | undefined, store: TimelapseStore | undefined;
    try {
      store = supplied ?? await openTimelapseStore();
      output = await exportVideo(store, clip, settings, session.acquiredCharacterId, controller.signal, setProgress);
      controller.signal.throwIfAborted();
      if (share && store.prepareShare) {
        const value = await store.prepareShare(output.name, output.mime);
        if (controller.signal.aborted) { value?.release(); controller.signal.throwIfAborted(); }
        if (value) { prepared.current = value; setShareReady(true); setNotice('動画の準備ができました。共有先を選んでください。'); return; }
      }
      setNotice(await store.deliver(output.name, output.mime, share));
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally {
      try { if (output?.temporary && store) await store.releaseExport(output.name); } catch { /* Startup recovery also removes abandoned export files. */ }
      exportController.current = null; setProgress(null);
    }
  }
  return <main className="timelapse-screen">
    <Brand /><button className="work-close timelapse-close" aria-label="前の画面へ戻る" onClick={onClose}><img src="/figma/timelapse-close.svg" alt="" /></button>
    <img className="timelapse-side left" src="/figma/timelapse-shima.png" alt="" />
    <img className="timelapse-side right" src={session.acquiredCharacterId ? character(session.acquiredCharacterId).portraitSrc : '/figma/result-unacquired.png'} alt="" />
    <section className="timelapse-panel" aria-labelledby="timelapse-title">
      <header><h1 id="timelapse-title">タイムラプス</h1><p>今日の姿勢を振り返ってみましょう。</p></header>
      <div className="timelapse-player">
        <video ref={video} src={source || undefined} muted playsInline autoPlay preload="auto" aria-hidden="true" tabIndex={-1} onLoadedData={() => { setReady(true); setDuration(Number.isFinite(video.current!.duration) ? video.current!.duration : clip?.duration ?? 0); }} onTimeUpdate={() => setAt(video.current?.currentTime ?? 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onSeeking={() => setSeeking(true)} onSeeked={() => { setSeeking(false); setAt(video.current?.currentTime ?? 0); }} onError={() => { setReady(false); setError('この動画を再生できません。保存した原本は保持されています。'); }} />
        <button type="button" className="timelapse-video-toggle" disabled={!ready || progress !== null} onClick={() => void toggle()} aria-label={playing ? '動画を一時停止' : at >= duration && duration > 0 ? '動画を最初から再生' : '動画を再生'}>
          <canvas ref={canvas} width={Math.min(1280, clip?.width ?? 1280)} height={Math.min(1280, clip?.width ?? 1280) / ((clip?.width ?? 1280) / (clip?.height ?? 720))} aria-hidden="true" />
          {feedback && <span key={feedback.key} className="timelapse-feedback" aria-hidden="true"><Icon name={feedback.kind} /></span>}
          {!ready && <span className="timelapse-empty">{error || loadError || (clip === undefined ? '記録を読み込んでいます…' : clip?.state === 'recording' ? '動画を保存しています…' : !playable ? 'この測定のタイムラプスはありません' : '動画を読み込んでいます…')}</span>}
          {seeking && <span className="timelapse-seeking" aria-hidden="true">読み込み中…</span>}
        </button>
        <div className="timelapse-seek"><time>{videoTime(at)}</time><input type="range" aria-label="動画の再生位置" aria-valuetext={`${videoTime(at)} / ${videoTime(duration)}`} min="0" max={duration || 1} step="0.05" value={at} disabled={!ready || progress !== null} onChange={event => { const value = Number(event.target.value); setAt(value); if (video.current) video.current.currentTime = value; }} /><time>{videoTime(duration)}</time></div>
      </div>
      <div className="timelapse-buttons"><button className="work-button white" disabled={!ready} onClick={changeSpeed} aria-label={`再生速度 ${SPEEDS[speed]}倍。押すと次の速度`}><span className="timelapse-speed-icon" aria-hidden="true"><img src="/figma/timelapse-speed.svg" alt="" /><img src="/figma/timelapse-speed.svg" alt="" /></span>{SPEEDS[speed]}倍速</button><button className="work-button orange" onClick={onHome}><img src="/figma/timelapse-home.svg" width="24" height="24" alt="" />ホームに戻る</button></div>
      <div className="timelapse-status" aria-live="polite">{clip?.state === 'partial' && <p>{clip.error || '保存できた範囲の映像です。'}</p>}{(error || loadError || notice) && <p role={error || loadError ? 'alert' : 'status'}>{error || loadError || notice}</p>}{shareReady && <button className="work-button white timelapse-share-ready" disabled={sharing} onClick={() => void sharePrepared()}>共有先を選ぶ</button>}{progress !== null && <div><label>1倍速で動画を書き出しています… {Math.round(progress * 100)}%<progress max="1" value={progress} /></label><button onClick={() => exportController.current?.abort()}>キャンセル</button></div>}</div>
    </section>
    <div className="timelapse-file-actions" role="toolbar" aria-label="タイムラプスの共有と保存"><button disabled={!playable || progress !== null || sharing} onClick={() => void (shareReady ? sharePrepared() : deliver(true))} aria-label="動画を共有（1倍速）"><img src="/figma/timelapse-share.svg" alt="" /></button><button disabled={!playable || progress !== null || sharing} onClick={() => void deliver(false)} aria-label="動画を保存（1倍速）"><img src="/figma/timelapse-save.svg" alt="" /></button></div>
  </main>;
}
