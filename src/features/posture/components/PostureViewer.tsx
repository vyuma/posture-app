import type { RefObject } from "react";

import type { PostureExperimentMetrics } from "../engine.types";
import type { AlertDisplayMode } from "../types";

type PostureViewerProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isBadPosture: boolean;
  alertDisplayMode: AlertDisplayMode;
  experiment: PostureExperimentMetrics;
  onAlertDisplayModeChange: (mode: AlertDisplayMode) => void;
};

export function PostureViewer({
  videoRef,
  canvasRef,
  isBadPosture,
  alertDisplayMode,
  experiment,
  onAlertDisplayModeChange,
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
      </section>

      <section className="angle-readout" aria-label="Neck angle signal">
        <div>
          <span>Neck 3D</span>
          <strong>{formatAngle(experiment.neckAngle3d)}</strong>
        </div>
        {experiment.neckAngle2dFallback !== null ? (
          <div>
            <span>2D fallback</span>
            <strong>{formatAngle(experiment.neckAngle2dFallback)}</strong>
          </div>
        ) : null}
        <small>{formatExperimentStatus(experiment)}</small>
      </section>

      <div className="legend">
        <span className="item nose">Nose</span>
        <span className="item face">Ears</span>
        <span className="item shoulder">Shoulders</span>
        <span className="item gaze">Hips</span>
      </div>
    </section>
  );
}

function formatAngle(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)} deg`;
}

function formatExperimentStatus(experiment: PostureExperimentMetrics) {
  if (experiment.sourceQuality === "vertical-fallback") {
    return "world Z angle active, vertical axis fallback";
  }

  if (experiment.neckAngle3d !== null) {
    return "world Z angle active";
  }

  if (experiment.sourceQuality === "missing-hips") {
    return "waiting for world hip landmarks";
  }

  if (experiment.sourceQuality === "world") {
    return "waiting for stable 3D vector";
  }

  if (experiment.neckAngle2dFallback !== null) {
    return "2D fallback active";
  }

  return "waiting for world landmarks";
}
