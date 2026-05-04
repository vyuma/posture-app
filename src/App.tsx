import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import "./App.css";
import { PairingDialog } from "./features/pairing";
import {
  PostureControlPanel,
  PostureViewer,
  type AlertDisplayMode,
  usePostureTracking,
} from "./features/posture";
import { sendPostureSignal } from "./lib/desktopBridge";

function App() {
  const {
    videoRef,
    canvasRef,
    ready,
    status,
    isBadPosture,
    snapshot,
    experimentHistory,
    resetPostureEngine,
  } = usePostureTracking();

  const [alertDisplayMode, setAlertDisplayMode] =
    useState<AlertDisplayMode>("debug");
  const [isPairingDialogOpen, setIsPairingDialogOpen] = useState(false);
  const lastBroadcastedPostureRef = useRef<boolean | null>(null);

  const shouldBlackoutScreen =
    isBadPosture && alertDisplayMode === "blackout";

  useEffect(() => {
    try {
      const appWindow = getCurrentWindow();
      void appWindow.setFullscreen(shouldBlackoutScreen);
    } catch {
      // Tauriコンテキスト外では fullscreen 制御を行わない。
    }

    if (lastBroadcastedPostureRef.current !== isBadPosture) {
      lastBroadcastedPostureRef.current = isBadPosture;
      void sendPostureSignal(isBadPosture).catch(() => {
        // Tauriコンテキスト外では posture signal を送信できないため無視する。
      });
    }
  }, [isBadPosture, shouldBlackoutScreen]);

  useEffect(() => {
    return () => {
      void sendPostureSignal(false).catch(() => {
        // Tauriコンテキスト外では posture signal を送信できないため無視する。
      });

      try {
        const appWindow = getCurrentWindow();
        void appWindow.setFullscreen(false);
      } catch {
        // Tauriコンテキスト外では fullscreen 制御を行わない。
      }
    };
  }, []);

  return (
    <main className={`app-shell ${shouldBlackoutScreen ? "app-shell--blackout" : ""}`}>
      <section className="hero">
        <div className="hero-topline">
          <div>
            <h1>Posture Camera Tracker</h1>
            <div className={`status ${ready ? "ok" : "warn"}`}>{status}</div>
          </div>

          <button
            type="button"
            className="pairing-launch"
            onClick={() => setIsPairingDialogOpen(true)}
          >
            モバイル連携
          </button>
        </div>
      </section>

      <section className="workbench">
        <PostureControlPanel
          snapshot={snapshot}
          experimentHistory={experimentHistory}
          onReset={resetPostureEngine}
        />

        <PostureViewer
          videoRef={videoRef}
          canvasRef={canvasRef}
          isBadPosture={isBadPosture}
          alertDisplayMode={alertDisplayMode}
          experiment={snapshot.experiment}
          onAlertDisplayModeChange={setAlertDisplayMode}
        />
      </section>

      {shouldBlackoutScreen ? (
        <section className="blackout-stage" aria-live="polite">
          <div className="blackout-copy">
            <h1>姿勢が悪いです</h1>
            <p>デバッグモードに切り替えるとカメラ映像を確認できます。</p>
          </div>
        </section>
      ) : null}

      {isPairingDialogOpen ? (
        <PairingDialog onClose={() => setIsPairingDialogOpen(false)} />
      ) : null}
    </main>
  );
}

export default App;
