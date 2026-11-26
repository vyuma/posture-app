import { t, useAppLanguage } from "../i18n";
import { useEffect, useRef, useState } from 'react';
import { Brand } from '../work/Home';
import { Icon } from '../work/Dialog';
import { character } from '../work/CharacterCard';
import type { Session } from '../work/model';
import { videoTime, type TimelapseSettings } from './model';
import { useClip } from './useClip';
import { openTimelapseStore } from './platform';
import type { MediaFile, PreparedShare, TimelapseStore } from './storage';
import { exportVideo } from './exportVideo';
import './timelapse.css';

export function TimelapseScreen({ session, settings, onClose, onHome, store: supplied }: { session: Session; settings: TimelapseSettings; onClose: () => void; onHome: () => void; store?: TimelapseStore }) {
  useAppLanguage();
  const { clip, error: loadError } = useClip(session.id, supplied);
  const video = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [source, setSource] = useState(''), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0), [duration, setDuration] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'play' | 'pause'; key: number } | null>(null);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState<number | null>(null);
  const playback = useRef<{ output: Awaited<ReturnType<typeof exportVideo>>; store: TimelapseStore } | null>(null);
  const prepared = useRef<PreparedShare | null>(null);
  const [shareReady, setShareReady] = useState(false), [sharing, setSharing] = useState(false);
  const sharingNow = useRef(false);
  const pendingRelease = useRef<(() => void) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const feedbackTimer = useRef(0), exportController = useRef<AbortController | null>(null), toggling = useRef(false);
  const playable = clip && ['ready', 'partial'].includes(clip.state) && clip.bytes > 0;
  useEffect(() => {
    if (!playable || !clip) return;
    const controller = new AbortController(); exportController.current = controller;
    let cancelled = false, media: MediaFile | undefined, store: TimelapseStore | undefined;
    let output: Awaited<ReturnType<typeof exportVideo>> | undefined, preview: typeof output;
    const release = () => {
      media?.release(); media = undefined;
      if (preview?.temporary && store) { void store.releaseExport(preview.name).catch(() => {}); preview = undefined; }
      if (output?.temporary && store) { void store.releaseExport(output.name).catch(() => {}); output = undefined; }
    };
    setReady(false); setSource(''); setAt(0); setDuration(0); setError(''); setProgress(0);
    void (async () => {
      try {
        store = supplied ?? await openTimelapseStore();
        const reducedPreview = reducedMotion && settings.includePet;
        output = await exportVideo(store, clip, settings, session.acquiredCharacterId, controller.signal, value => { if (!cancelled) setProgress(value * (reducedPreview ? .5 : 1)); });
        controller.signal.throwIfAborted();
        // Preview accessibility must not change the animation in the saved recording.
        if (reducedPreview) preview = await exportVideo(store, clip, settings, session.acquiredCharacterId, controller.signal, value => { if (!cancelled) setProgress(.5 + value * .5); }, true);
        controller.signal.throwIfAborted();
        media = await store.media((preview ?? output).name); controller.signal.throwIfAborted();
        playback.current = { output, store }; setSource(media.url);
      } catch (cause) {
        release();
        if (!cancelled) setError(controller.signal.aborted ? "動画の準備をキャンセルしました。" : cause instanceof Error ? cause.message : "動画を作成できませんでした。");
      } finally {
        if (!cancelled) setProgress(null);
        if (exportController.current === controller) exportController.current = null;
      }
    })();
    return () => { cancelled = true; controller.abort(); video.current?.pause(); playback.current = null; if (sharingNow.current) { const previous = pendingRelease.current; pendingRelease.current = () => { previous?.(); release(); }; } else release(); };
  }, [clip?.file, playable, supplied, settings, session.acquiredCharacterId, attempt, reducedMotion]);
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
    } catch { setError("再生を開始できませんでした。もう一度、映像を押してください。"); }
    finally { toggling.current = false; }
  }
  async function sharePrepared() {
    if (!prepared.current || sharingNow.current) return;
    sharingNow.current = true; setSharing(true); setError('');
    try {
      setNotice(await prepared.current.share());
      prepared.current?.release(); prepared.current = null; setShareReady(false);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setNotice("共有をキャンセルしました。もう一度、共有先を選べます。");
      else setError("共有メニューを開けませんでした。再試行するか、保存ボタンで動画を保存してください。");
    } finally { sharingNow.current = false; setSharing(false); pendingRelease.current?.(); pendingRelease.current = null; }
  }
  async function deliver(share: boolean) {
    if (!playback.current || sharingNow.current) return;
    sharingNow.current = true; setSharing(true);
    prepared.current?.release(); prepared.current = null; setShareReady(false);
    video.current?.pause(); setError(''); setNotice('');
    const active = playback.current;
    const { output, store } = active;
    try {
      if (share && store.prepareShare) {
        const value = await store.prepareShare(output.name, output.mime);
        if (playback.current !== active) { value?.release(); return; }
        if (value) { prepared.current = value; setShareReady(true); setNotice("共有先を選んでください。"); return; }
      }
      setNotice(await store.deliver(output.name, output.mime, share));
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { sharingNow.current = false; setSharing(false); pendingRelease.current?.(); pendingRelease.current = null; }
  }
  return <main className="timelapse-screen">
    <Brand /><button className="work-close timelapse-close" aria-label={t("前の画面へ戻る")} onClick={onClose}><img src="/figma/timelapse-close.svg" alt="" /></button>
    <img className="timelapse-side left" src="/figma/timelapse-shima.png" alt="" />
    <img className="timelapse-side right" src={session.acquiredCharacterId ? character(session.acquiredCharacterId).portraitSrc : '/figma/result-unacquired.png'} alt="" />
    <section className="timelapse-panel" aria-labelledby="timelapse-title">
      <header><h1 id="timelapse-title">{t("タイムラプス")}</h1><p>{t("今日の姿勢を振り返ってみましょう。")}</p></header>
      <div className="timelapse-player">
        <video ref={video} src={source || undefined} muted playsInline autoPlay preload="auto" aria-hidden="true" tabIndex={-1} onLoadedData={() => { setReady(true); setDuration(Number.isFinite(video.current!.duration) ? video.current!.duration : Math.min(clip?.duration ?? 0, 60)); }} onTimeUpdate={() => setAt(video.current?.currentTime ?? 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onSeeking={() => setSeeking(true)} onSeeked={() => { setSeeking(false); setAt(video.current?.currentTime ?? 0); }} onError={() => { setReady(false); setError("この動画を再生できません。保存した原本は保持されています。"); }} />
        <button type="button" className="timelapse-video-toggle" disabled={!ready || progress !== null} onClick={() => void toggle()} aria-label={playing ? t("動画を一時停止") : at >= duration && duration > 0 ? t("動画を最初から再生") : t("動画を再生")}>
          {feedback && <span key={feedback.key} className="timelapse-feedback" aria-hidden="true"><Icon name={feedback.kind} /></span>}
          {!ready && <span className="timelapse-empty">{(error || loadError) ? t(error || loadError) : (progress !== null ? t("動画を準備しています… {0}%", { 0: Math.round(progress * 100) }) : clip === undefined ? t("記録を読み込んでいます…") : clip?.state === 'recording' ? t("動画を保存しています…") : !playable ? t("この測定のタイムラプスはありません") : t("動画を読み込んでいます…"))}</span>}
          {seeking && <span className="timelapse-seeking" aria-hidden="true">{t("読み込み中…")}</span>}
        </button>
        <div className="timelapse-seek"><time>{videoTime(at)}</time><input type="range" aria-label={t("動画の再生位置")} aria-valuetext={`${videoTime(at)} / ${videoTime(duration)}`} min="0" max={duration || 1} step="0.05" value={at} disabled={!ready || progress !== null} onChange={event => { const value = Number(event.target.value); setAt(value); if (video.current) video.current.currentTime = value; }} /><time>{videoTime(duration)}</time></div>
      </div>
      <div className="timelapse-buttons"><button className="work-button white" onClick={onClose}><span className="timelapse-back-icon" aria-hidden="true"><img src="/figma/timelapse-back.svg" alt="" /></span>{t("獲得画面に戻る")}</button><button className="work-button orange" onClick={onHome}><img src="/figma/timelapse-home.svg" width="24" height="24" alt="" />{t("ホーム画面へ")}</button></div>
      <div className="timelapse-status" aria-live="polite">{clip?.state === 'partial' && <p>{t(clip.error || "保存できた範囲の映像です。")}</p>}{(error || loadError || notice) && <p role={error || loadError ? 'alert' : 'status'}>{t(error || loadError || notice)}</p>}{error && !source && playable && progress === null && <button onClick={() => setAttempt(value => value + 1)}>{t("再試行")}</button>}{shareReady && <button className="work-button white timelapse-share-ready" disabled={sharing} onClick={() => void sharePrepared()}>{t("共有先を選ぶ")}</button>}{progress !== null && <div><label>{t("動画を準備しています…")}{Math.round(progress * 100)}%<progress max="1" value={progress} /></label><button onClick={() => exportController.current?.abort()}>{t("キャンセル")}</button></div>}</div>
    </section>
    <div className="timelapse-file-actions" role="toolbar" aria-label={t("タイムラプスの共有と保存")}><button disabled={!ready || progress !== null || sharing} onClick={() => void (shareReady ? sharePrepared() : deliver(true))} aria-label={t("動画を共有")}><img src="/figma/timelapse-share.svg" alt="" /></button><button disabled={!ready || progress !== null || sharing} onClick={() => void deliver(false)} aria-label={t("動画を保存")}><img src="/figma/timelapse-save.svg" alt="" /></button></div>
  </main>;
}
