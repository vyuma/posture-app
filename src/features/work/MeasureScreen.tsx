import { PostureGuide } from './PostureGuide';
import { t, useAppLanguage } from "../i18n";
import type { CSSProperties, RefObject } from 'react';
import { Brand } from './Home';
import { goodRatio, timeLabel, type Session } from './model';
import { POSTURE_SPEC } from '../posture/engine.spec';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '../sound/types/soundSettings';
import { SoundSelect } from './SoundSelect';
import './measurement-layout.css';
import '../legal/legal.css';

import { CalibrationProgress } from './CalibrationProgress';

export type MeasureStage = 'prepare' | 'calibrate' | 'ready' | 'active';
export function MeasureScreen({ stage, session, videoRef, canvasRef, status, ready, remainingCalibrationMs, onRegister, onCancel, onRecalibrate, onPause, onFinish, widgetEnabled = true, recording = false, onWidgetChange, sound, onSoundChange }: {
  stage: MeasureStage; session: Session | null; videoRef: RefObject<HTMLVideoElement | null>; canvasRef: RefObject<HTMLCanvasElement | null>; status: string; ready: boolean; remainingCalibrationMs: number; tracking: boolean;
  onRegister: () => void; onCancel: () => void; onRecalibrate: () => void; onPause: () => void; onFinish: () => void;
  recording?: boolean; widgetEnabled?: boolean; onWidgetChange?: (value: boolean) => void; sound?: SoundSettings; onSoundChange?: (value: SoundSettings) => void;
}) {
  useAppLanguage();
  const paused = session?.status === 'paused';
  const rest = session?.phase === 'rest';
  const ratio = session ? goodRatio(session) : null;
  const registering = stage === 'calibrate' || stage === 'ready';
  const heading = stage === 'prepare' ? t("姿勢チェック") : registering ? t("姿勢を登録") : paused ? t("一時停止中") : rest ? t("休憩中") : t("姿勢測定中");
  const description = stage === 'prepare' ? t("姿勢登録の準備をしましょう。") : registering ? t("正しい姿勢のまま５秒間キープ！") : paused || rest ? t("一度立ち上がって、ストレッチをしましょう。") : t("良い姿勢を続けて、新しいピンアナゴに出会おう。");
  // Follow the posture engine's clock, including resets when tracking is lost.
  const remaining = Math.max(0, Math.min(POSTURE_SPEC.warmupMs, remainingCalibrationMs));
  const camera = <div className="work-camera">
    <video ref={videoRef} autoPlay playsInline muted aria-label={t("カメラプレビュー")} /><canvas ref={canvasRef} aria-hidden="true" />
    {stage === 'prepare' && <>
      <svg className="work-camera-framing" viewBox="0 0 518 304" aria-hidden="true">
        <image href="/figma/posture-frame-face.svg" x="181" y="23" width="155" height="155" />
        <image href="/figma/posture-frame-shoulders.svg" x="41" y="198" width="435" height="106" />
      </svg>
      {!ready && <div className="work-camera-preparation-status" role="status">
        <p>{status.startsWith('初期化に失敗しました') ? t("カメラを開けません。権限を確認して、ホームからやり直してください。") : t("カメラを準備中…")}</p>
        {status.startsWith('初期化に失敗しました') && <button className="work-button white" onClick={onCancel}>{t("ホームへ戻る")}</button>}
      </div>}
    </>}
    {recording && stage === 'active' && <span className="work-recording-indicator" role="status">{t("録画中")}</span>}
    {registering && <div className="work-calibration-overlay">
      <div className="work-calibration-ring" data-complete={stage === 'ready'}>
        <svg viewBox="0 0 320 320" aria-hidden="true"><circle className="work-calibration-track" cx="160" cy="160" r="150" /><CalibrationProgress remaining={remaining} duration={POSTURE_SPEC.warmupMs} complete={stage === 'ready'} /></svg>
        <b role="timer" aria-live="off">{stage === 'ready' ? 'DONE' : Math.max(1, Math.ceil(remaining / 1000))}</b>
      </div>
      <strong className="work-calibration-label" role="status">{stage === 'ready' ? t("登録完了！") : t("姿勢を登録中")}</strong>
      <p className="work-calibration-note">{t("※この姿勢が測定時の基準となります。")}</p>
    </div>}
  </div>;
  return <main className={`work-screen work-measure-screen stage-${stage}${rest && !paused ? ' is-rest' : ''}`}>
    <Brand />
    {stage !== 'active' && <button className="work-close screen-close" aria-label={t("登録をキャンセル")} onClick={onCancel}><img src="/figma/timelapse-close.svg" alt="" /></button>}
    <section className={stage === 'active' ? 'work-measuring-panel' : 'work-glass work-registration-panel'}>
      <header className="work-measure-heading"><h1>{heading}</h1><p>{description}</p>{stage === 'active' && <button className="work-button white" onClick={onRecalibrate}>{t("姿勢を再登録")}</button>}</header>
      {stage === 'prepare' ? <>
        <PostureGuide>{camera}</PostureGuide>
        <button className="work-button orange" onClick={onRegister} disabled={!ready}>{t("準備できた！")}</button>
      </> : stage === 'active' && session ? <>
        <div className="work-measuring-grid">
          <div className="work-camera-column">{camera}</div>
          <aside className="work-live-controls">
            <div className={`work-live-metrics${rest ? ' is-rest' : ''}`}>
              <div><span>{rest ? t("休憩タイム") : t("集中タイム")}</span><strong role="timer">{timeLabel(session.remainingMs)}</strong></div>
              {!rest && <div><span>{t("ピーン率")}</span><strong>{ratio === null ? '—' : Math.round(ratio * 100)}{ratio !== null && <small>％</small>}</strong></div>}
            </div>
            <label className="work-switch-row">{t("ウィジェット表示")}<input aria-label={t("ウィジェット表示")} type="checkbox" role="switch" checked={widgetEnabled} onChange={event => onWidgetChange?.(event.target.checked)} /></label>
            <label className="work-switch-row">{t("サウンド")}<input aria-label={t("サウンド")} type="checkbox" role="switch" checked={sound?.enabled ?? true} onChange={event => sound && onSoundChange?.({ ...sound, enabled: event.target.checked })} /></label>
            <div className="work-inline-sound"><label><span>{t("音量")}</span><input aria-label={t("音量")} type="range" min="0" max="1" step="0.01" style={{ '--volume-progress': `${(sound?.volume ?? .7) * 100}%` } as CSSProperties} value={sound?.volume ?? .7} onChange={event => sound && onSoundChange?.({ ...sound, volume: Number(event.target.value) })} /></label><SoundSelect settings={sound ?? DEFAULT_SOUND_SETTINGS} onChange={onSoundChange} /></div>
          </aside>
        </div>
        <footer className="work-measure-footer"><button className="work-button white" onClick={onPause}>{paused && <svg className="work-resume-icon" viewBox="0 0 21 24" aria-hidden="true"><image href="/figma/measure-resume.svg" x="6" y="2" width="15" height="20" /></svg>}<span>{paused ? t("再開") : t("一時停止")}</span></button><button className="work-button blue" onClick={onFinish}>{t("終了")}</button></footer>
      </> : <div className="work-calibration-content">{camera}</div>}
    </section>
  </main>;
}
