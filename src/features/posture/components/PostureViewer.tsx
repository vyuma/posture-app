import type { RefObject } from "react";

import type { PostureExperimentMetrics } from "../engine.types";
import type { AlertDisplayMode } from "../types";

type PostureViewerProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isBadPosture: boolean;
  alertDisplayMode: AlertDisplayMode;
  isOverlayEnabled: boolean;
  experiment: PostureExperimentMetrics;
  onAlertDisplayModeChange: (mode: AlertDisplayMode) => void;
  onOverlayEnabledChange: (enabled: boolean) => void;
};

export function PostureViewer({
  videoRef,
  canvasRef,
  isBadPosture,
  alertDisplayMode,
  isOverlayEnabled,
  experiment,
  onAlertDisplayModeChange,
  onOverlayEnabledChange,
}: PostureViewerProps) {
  return (
    <section className="viewer">
      <video ref={videoRef} className="camera" playsInline muted />
      <canvas ref={canvasRef} className="overlay" />

      <div
        className={`posture-alert ${isBadPosture ? "show" : "hide"}`}
        role="status"
        aria-live="polite"
      >
        姿勢が悪いです
      </div>

      <section className="display-mode-switch" aria-label="姿勢アラート表示モード">
        <span>姿勢アラート</span>
        <label className="mode-toggle" htmlFor="alert-display-mode">
          <input
            id="alert-display-mode"
            type="checkbox"
            checked={alertDisplayMode === "blackout"}
            onChange={(event) => {
              onAlertDisplayModeChange(
                event.currentTarget.checked ? "blackout" : "debug",
              );
            }}
          />
          <span>
            {alertDisplayMode === "blackout"
              ? "運用(画面ブラックアウト)"
              : "デバッグ(メッセージのみ)"}
          </span>
        </label>
        <label className="mode-toggle" htmlFor="overlay-enabled">
          <input
            id="overlay-enabled"
            type="checkbox"
            checked={isOverlayEnabled}
            onChange={(event) => {
              onOverlayEnabledChange(event.currentTarget.checked);
            }}
          />
          <span>オーバーレイ {isOverlayEnabled ? "ON" : "OFF"}</span>
        </label>
      </section>

      <section className="angle-readout" aria-label="首角度シグナル">
        <div>
          <span>首角度 3D</span>
          <strong>{formatAngle(experiment.neckAngle3d)}</strong>
        </div>
        {experiment.neckAngle2dFallback !== null ? (
          <div>
            <span>2Dフォールバック</span>
            <strong>{formatAngle(experiment.neckAngle2dFallback)}</strong>
          </div>
        ) : null}
        <small>{formatExperimentStatus(experiment)}</small>
      </section>

      <div className="legend">
        <span className="item nose">鼻</span>
        <span className="item face">耳</span>
        <span className="item shoulder">肩</span>
        <span className="item gaze">腰</span>
      </div>
    </section>
  );
}

function formatAngle(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}°`;
}

function formatExperimentStatus(experiment: PostureExperimentMetrics) {
  if (experiment.sourceQuality === "vertical-fallback") {
    return "ワールドZ角度を使用中（鉛直軸フォールバック）";
  }

  if (experiment.neckAngle3d !== null) {
    return "ワールドZ角度を使用中";
  }

  if (experiment.sourceQuality === "missing-hips") {
    return "ワールド座標の腰ランドマーク待機中";
  }

  if (experiment.sourceQuality === "world") {
    return "安定した3Dベクトルを待機中";
  }

  if (experiment.neckAngle2dFallback !== null) {
    return "2Dフォールバックを使用中";
  }

  return "ワールドランドマークを待機中";
}
