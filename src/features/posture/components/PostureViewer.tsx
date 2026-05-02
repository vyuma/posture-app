import type { RefObject } from "react";

import type { AlertDisplayMode } from "../types";

type PostureViewerProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isBadPosture: boolean;
  alertDisplayMode: AlertDisplayMode;
  onAlertDisplayModeChange: (mode: AlertDisplayMode) => void;
};

export function PostureViewer({
  videoRef,
  canvasRef,
  isBadPosture,
  alertDisplayMode,
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

      <div className="legend">
        <span className="item nose">Nose</span>
        <span className="item face">Ears</span>
        <span className="item shoulder">Shoulders</span>
        <span className="item gaze">Hips</span>
      </div>
    </section>
  );
}
