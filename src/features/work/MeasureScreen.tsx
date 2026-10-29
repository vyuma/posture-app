import type { CSSProperties, RefObject } from 'react';
import { Brand } from './Home';
import { goodRatio, timeLabel, type Session } from './model';
import { POSTURE_SPEC } from '../posture/engine.spec';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '../sound/types/soundSettings';
import { SoundSelect } from './SoundSelect';
import './measurement-layout.css';

import { CalibrationProgress } from './CalibrationProgress';

export type MeasureStage = 'prepare' | 'calibrate' | 'ready' | 'active';
export function MeasureScreen({ stage, session, videoRef, canvasRef, ready, remainingCalibrationMs, onRegister, onCancel, onRecalibrate, onPause, onFinish, widgetEnabled = true, onWidgetChange, sound, onSoundChange }: {
  stage: MeasureStage; session: Session | null; videoRef: RefObject<HTMLVideoElement | null>; canvasRef: RefObject<HTMLCanvasElement | null>; status: string; ready: boolean; remainingCalibrationMs: number; tracking: boolean;
  onRegister: () => void; onCancel: () => void; onRecalibrate: () => void; onPause: () => void; onFinish: () => void;
  widgetEnabled?: boolean; onWidgetChange?: (value: boolean) => void; sound?: SoundSettings; onSoundChange?: (value: SoundSettings) => void;
}) {
  const paused = session?.status === 'paused';
  const rest = session?.phase === 'rest';
  const ratio = session ? goodRatio(session) : null;
  const registering = stage === 'calibrate' || stage === 'ready';
  const heading = stage === 'prepare' ? '姿勢チェック' : registering ? '姿勢を登録' : paused ? '一時停止中' : rest ? '休憩中' : '姿勢測定中';
  const description = stage === 'prepare' ? '姿勢登録の準備をしましょう。' : registering ? '正しい姿勢のまま５秒間キープ！' : paused || rest ? '一度立ち上がって、ストレッチをしましょう。' : 'ピーン率が高いと、レアなピンアナゴに出会えるかも。';
  // Follow the posture engine's clock, including resets when tracking is lost.
  const remaining = Math.max(0, Math.min(POSTURE_SPEC.warmupMs, remainingCalibrationMs));
  const camera = <div className="work-camera">
    <video ref={videoRef} autoPlay playsInline muted /><canvas ref={canvasRef} />
    {registering && <div className="work-calibration-overlay">
      <div className="work-calibration-ring" data-complete={stage === 'ready'}>
        <svg viewBox="0 0 320 320" aria-hidden="true"><circle className="work-calibration-track" cx="160" cy="160" r="150" /><CalibrationProgress remaining={remaining} duration={POSTURE_SPEC.warmupMs} complete={stage === 'ready'} /></svg>
        <b role="timer" aria-live="off">{stage === 'ready' ? 'DONE' : Math.max(1, Math.ceil(remaining / 1000))}</b>
      </div>
      <strong className="work-calibration-label" role="status">{stage === 'ready' ? '登録完了！' : '姿勢を登録中'}</strong>
      <p className="work-calibration-note">※この姿勢が測定時の基準となります。</p>
    </div>}
  </div>;
  return <main className={`work-screen work-measure-screen stage-${stage}${rest && !paused ? ' is-rest' : ''}`}>
    <Brand />
    {stage !== 'active' && <button className="work-close screen-close" aria-label="登録をキャンセル" onClick={onCancel}><img src="/figma/timelapse-close.svg" alt="" /></button>}
    <section className={stage === 'active' ? 'work-measuring-panel' : 'work-glass work-registration-panel'}>
      <header className="work-measure-heading"><h1>{heading}</h1><p>{description}</p>{stage === 'active' && <button className="work-button white" onClick={onRecalibrate}>姿勢を再登録</button>}</header>
      {stage === 'prepare' ? <>
        <div className="work-preparation-guide"><div className="work-preparation-crop"><img src="/figma/posture-guide-source.png" alt="正しい姿勢：画面から40cm以上離れ、顎を引き、背筋を伸ばす。膝と肘は約90度、足を床につける。猫背、反り腰、仙骨座りに気をつけよう。" /></div><div className="work-preparation-crop is-followup" aria-hidden="true"><img src="/figma/posture-guide-source.png" alt="" /></div></div>
        <div className="work-camera-preload" aria-hidden="true">{camera}</div>
        <button className="work-button orange" onClick={onRegister} disabled={!ready}>準備できた！</button>
      </> : stage === 'active' && session ? <>
        <div className="work-measuring-grid">
          <div className="work-camera-column">{camera}</div>
          <aside className="work-live-controls">
            <div className={`work-live-metrics${rest ? ' is-rest' : ''}`}>
              <div><span>{rest ? '休憩タイム' : '集中タイム'}</span><strong role="timer">{timeLabel(session.remainingMs)}</strong></div>
              {!rest && <div><span>ピーン率</span><strong>{ratio === null ? '—' : Math.round(ratio * 100)}{ratio !== null && <small>％</small>}</strong></div>}
            </div>
            <label className="work-switch-row">ウィジェット表示<input aria-label="ウィジェット表示" type="checkbox" role="switch" checked={widgetEnabled} onChange={event => onWidgetChange?.(event.target.checked)} /></label>
            <label className="work-switch-row">サウンド<input aria-label="サウンド" type="checkbox" role="switch" checked={sound?.enabled ?? true} onChange={event => sound && onSoundChange?.({ ...sound, enabled: event.target.checked })} /></label>
            <div className="work-inline-sound"><label><span>音量</span><input aria-label="音量" type="range" min="0" max="1" step="0.01" style={{ '--volume-progress': `${(sound?.volume ?? .7) * 100}%` } as CSSProperties} value={sound?.volume ?? .7} onChange={event => sound && onSoundChange?.({ ...sound, volume: Number(event.target.value) })} /></label><SoundSelect settings={sound ?? DEFAULT_SOUND_SETTINGS} onChange={onSoundChange} /></div>
          </aside>
        </div>
        <footer className="work-measure-footer"><button className="work-button white" onClick={onPause}>{paused ? '再開' : '一時停止'}</button><button className="work-button blue" onClick={onFinish}>終了</button></footer>
      </> : <div className="work-calibration-content">{camera}</div>}
    </section>
  </main>;
}
