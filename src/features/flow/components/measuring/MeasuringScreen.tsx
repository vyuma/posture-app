import { useEffect, useMemo, useRef, useState } from "react";

import {
  emitOverlayPlacementHintRefresh,
} from "../../../overlay/overlayPlacementHintBridge";
import {
  isOverlayDebugUiEnabled,
  OVERLAY_DEBUG_UI_STORAGE_KEY,
} from "../../../overlay/overlayState";
import { POSTURE_SPEC, PostureViewer } from "../../../posture";
import { playSoundPreview } from "../../../sound/services/recoverySound";
import { BUILTIN_SOUND_OPTIONS } from "../../../sound/types/soundSettings";
import { useLiveFigmaPrScaleStyle } from "../../hooks/useLiveFigmaPrScaleStyle";
import type { MeasuringScreenProps } from "../flowScreenTypes";
import { FlowBrand } from "../shared/FlowBrand";
import {
  MeasurePauseIcon,
  MeasurePlayIcon,
  MeasureStopIcon,
} from "../shared/MeasureIcons";
import { MetricTile } from "../shared/MetricTile";
import { formatDuration } from "../shared/formatters";
import { buildFrame53SoundLabel } from "../shared/soundLabels";
import { WarmupCountdownVeil } from "./WarmupCountdownVeil";

export function MeasuringScreen({
  videoRef,
  canvasRef,
  snapshot,
  stats,
  isBadPosture,
  isPaused,
  isOverlayEnabled,
  isCharacterOverlayEnabled,
  soundSettings,
  onSoundSettingsChange,
  onFinishMeasurement,
  onReRegisterPosture,
  onPauseToggle,
  onOverlayEnabledChange,
  onCharacterOverlayEnabledChange,
  onShowCharacterOverlay,
  onResetCharacterPosition,
}: MeasuringScreenProps) {
  const figmaPrScaleStyle = useLiveFigmaPrScaleStyle();

  const isWarmup = !snapshot.baselineReady;

  const showMeasureDevTools = isOverlayDebugUiEnabled();

  const volumePreviewTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (volumePreviewTimerRef.current !== null) {
        clearTimeout(volumePreviewTimerRef.current);
      }
    };
  }, []);

  function scheduleMeasureVolumePreview(volume: number, selectedSrc: string) {
    if (volumePreviewTimerRef.current !== null) {
      clearTimeout(volumePreviewTimerRef.current);
    }
    volumePreviewTimerRef.current = window.setTimeout(() => {
      volumePreviewTimerRef.current = null;
      void playSoundPreview({ src: selectedSrc, volume });
    }, 220);
  }

  const soundOptionList = useMemo(() => {
    return Array.from(
      new Set([...BUILTIN_SOUND_OPTIONS, ...soundSettings.customSounds]),
    );
  }, [soundSettings.customSounds]);

  const [placementHintEmitNotice, setPlacementHintEmitNotice] = useState<
    "ok" | "fail" | null
  >(null);
  const placementHintEmitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (placementHintEmitTimerRef.current !== null) {
        window.clearTimeout(placementHintEmitTimerRef.current);
      }
    };
  }, []);

  async function handleEmitOverlayPlacementHintRefresh() {
    if (placementHintEmitTimerRef.current !== null) {
      window.clearTimeout(placementHintEmitTimerRef.current);
    }
    const ok = await emitOverlayPlacementHintRefresh();
    setPlacementHintEmitNotice(ok ? "ok" : "fail");
    placementHintEmitTimerRef.current = window.setTimeout(() => {
      setPlacementHintEmitNotice(null);
      placementHintEmitTimerRef.current = null;
    }, 3400);
  }

  const headingId = "measuring-heading";
  const statusHintId = "measuring-status-hint";
  const goodPercentWhole = Math.round(
    Math.min(1, Math.max(0, stats.goodRatio)) * 100,
  );
  const warmupElapsedMs = isWarmup
    ? Math.max(0, POSTURE_SPEC.warmupMs - snapshot.warmupRemainingMs)
    : 0;

  const gaugePercent = isWarmup
    ? 0
    : Math.round(Math.min(1, Math.max(0, stats.goodRatio)) * 100);
  const stopDisabled =
    !snapshot.baselineReady || stats.activeMeasurementMs <= 0;
  const pauseDisabled = isWarmup;

  return (
    <main
      className="flow-screen measuring-screen"
      style={figmaPrScaleStyle}
    >
      <FlowBrand />
      <section
        className="measure-layout"
        aria-labelledby={headingId}
        aria-describedby={statusHintId}
      >
        <aside className="measure-control-card" aria-label="測定コントロール">
          <div className="measure-control-scroll">
          <header className="measure-control-head">
            <div>
              <h1 id={headingId} className="measure-control-title">
                姿勢測定中
              </h1>
              <p id={statusHintId} className="measure-control-status-hint">
                {isWarmup
                  ? "基準線を学習しています…"
                  : isPaused
                    ? "一時停止中です"
                    : "測定中です"}
              </p>
            </div>
            <div className="measure-control-icon-actions">
              <button
                type="button"
                className={`measure-icon-btn measure-icon-btn--pause ${isPaused ? "is-resume" : ""}`}
                onClick={onPauseToggle}
                disabled={pauseDisabled}
                aria-label={isPaused ? "再開" : "一時停止"}
              >
                {isPaused ? (
                  <MeasurePlayIcon />
                ) : (
                  <MeasurePauseIcon />
                )}
              </button>
              <button
                type="button"
                className="measure-icon-btn measure-icon-btn--stop"
                onClick={onFinishMeasurement}
                disabled={stopDisabled}
                aria-label="測定を終了"
              >
                <MeasureStopIcon />
              </button>
            </div>
          </header>

          <div className="measure-metrics-row">
            <MetricTile
              label="測定時間"
              value={
                isWarmup
                  ? formatDuration(warmupElapsedMs)
                  : formatDuration(stats.activeMeasurementMs)
              }
            />
            <MetricTile
              label="良い姿勢率"
              value={isWarmup ? "—" : String(goodPercentWhole)}
              valueSuffix={isWarmup ? undefined : "%"}
            />
          </div>

          <div className="measure-card-rule" role="presentation" />

          <div className="frame53-toggle-strip">
            <span
              id="measure-pin-label"
              className="frame53-toggle-strip-label"
            >
              ピンアナゴ表示
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${isCharacterOverlayEnabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={isCharacterOverlayEnabled}
              aria-labelledby="measure-pin-label"
              onClick={() =>
                onCharacterOverlayEnabledChange(!isCharacterOverlayEnabled)
              }
            >
              <span className="frame53-toggle-strip-switch-knob" aria-hidden />
            </button>
          </div>

          <div className="measure-card-rule" role="presentation" />

          <div className="frame53-toggle-strip">
            <span
              id="measure-sound-label"
              className="frame53-toggle-strip-label"
            >
              サウンド
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${soundSettings.enabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={soundSettings.enabled}
              aria-labelledby="measure-sound-label"
              onClick={() =>
                onSoundSettingsChange({
                  ...soundSettings,
                  enabled: !soundSettings.enabled,
                })
              }
            >
              <span className="frame53-toggle-strip-switch-knob" aria-hidden />
            </button>
          </div>

          <div
            className={`frame53-sound-card ${!soundSettings.enabled ? "frame53-muted" : ""}`}
          >
            <label className="frame53-volume-row" htmlFor="measure-volume">
              <span className="frame53-volume-visible-label">音量</span>
              <input
                id="measure-volume"
                className="frame53-volume-range"
                type="range"
                min={0}
                max={100}
                value={Math.round(soundSettings.volume * 100)}
                style={{
                  ["--frame53-volume-pct" as string]: `${Math.round(soundSettings.volume * 100)}%`,
                }}
                onChange={(e) => {
                  const volume = Number(e.target.value) / 100;
                  onSoundSettingsChange({
                    ...soundSettings,
                    volume,
                  });
                  scheduleMeasureVolumePreview(volume, soundSettings.selectedSound);
                }}
              />
            </label>
            <p className="frame53-sfx-label">効果音</p>
            <div className="frame53-sfx-shell">
              <select
                className="frame53-sfx-select"
                aria-label="効果音の種類"
                value={soundSettings.selectedSound}
                onChange={(e) => {
                  const selectedSound = e.target.value;
                  onSoundSettingsChange({
                    ...soundSettings,
                    selectedSound,
                  });
                  void playSoundPreview({
                    src: selectedSound,
                    volume: soundSettings.volume,
                  });
                }}
              >
                {soundOptionList.map((option) => (
                  <option key={option} value={option}>
                    {buildFrame53SoundLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showMeasureDevTools ? (
            <div className="measure-debug-tools">
              <p className="measure-debug-tools-label">開発・検証</p>
              <div className="frame53-toggle-strip measure-debug-overlay-row">
                <span
                  id="measure-dev-overlay-label"
                  className="frame53-toggle-strip-label"
                >
                  ライン表示
                </span>
                <button
                  type="button"
                  className={`frame53-toggle-strip-switch ${isOverlayEnabled ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={isOverlayEnabled}
                  aria-labelledby="measure-dev-overlay-label"
                  onClick={() => onOverlayEnabledChange(!isOverlayEnabled)}
                >
                  <span className="frame53-toggle-strip-switch-knob" aria-hidden />
                </button>
              </div>
              {!isCharacterOverlayEnabled ? (
                <button type="button" className="tool-pill" onClick={onShowCharacterOverlay}>
                  キャラ表示
                </button>
              ) : null}
              <div className="measure-debug-tools-tail">
                <button
                  type="button"
                  className="tool-pill measure-tool-overlay-hint-debug"
                  title={`クリックでデスクトップオーバーレイへ配置ヒント再表示を送る（${OVERLAY_DEBUG_UI_STORAGE_KEY}）`}
                  onClick={() => void handleEmitOverlayPlacementHintRefresh()}
                >
                  配置ヒント(debug)
                </button>
                <button type="button" className="tool-pill" onClick={onResetCharacterPosition}>
                  位置リセット
                </button>
                {placementHintEmitNotice ? (
                  <p
                    className={`measure-placement-hint-emit-feedback measure-placement-hint-emit-feedback--${placementHintEmitNotice}`}
                    role="status"
                  >
                    {placementHintEmitNotice === "ok"
                      ? "配置ヒントをオーバーレイへ送りました。画面右下のキャラ付近を確認してください。"
                      : "送信できませんでした（ブラウザでは Tauri がありません）。"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          </div>

          <div className="measure-control-card-footer">
            <button
              type="button"
              className="measure-reregister-cta"
              onClick={onReRegisterPosture}
            >
              姿勢を再登録する
            </button>
          </div>
        </aside>

        <div className="measure-camera-panel measure-camera-panel--figma">
          <div className="measure-camera-stack">
            <div
              className={`measure-posture-gauge ${isWarmup ? "measure-posture-gauge--warmup" : ""}`}
              aria-hidden={isWarmup}
            >
              <span className="measure-posture-gauge-end measure-posture-gauge-end--bad">
                悪い
              </span>
              <div className="measure-posture-gauge-track">
                <div
                  className="measure-posture-gauge-fill"
                  style={{ width: `${gaugePercent}%` }}
                />
              </div>
              <span className="measure-posture-gauge-end measure-posture-gauge-end--good">
                良い
              </span>
            </div>
            <PostureViewer
              variant="measurement"
              videoRef={videoRef}
              canvasRef={canvasRef}
              isBadPosture={isBadPosture}
              isOverlayEnabled={isOverlayEnabled}
              isCharacterOverlayEnabled={isCharacterOverlayEnabled}
              experiment={snapshot.experiment}
              onOverlayEnabledChange={onOverlayEnabledChange}
              onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
            />
            {isWarmup ? (
              <WarmupCountdownVeil
                remainingMs={snapshot.warmupRemainingMs}
                totalMs={POSTURE_SPEC.warmupMs}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
