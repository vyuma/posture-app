import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import "./App.css";
import { PairingDialog } from "./features/pairing";
import {
  PostureControlPanel,
  PostureViewer,
  usePostureTransitionEffects,
  usePostureTracking,
} from "./features/posture";
import { POSTURE_SPEC } from "./features/posture/engine.spec";
import { SoundSettingsDialog } from "./features/sound/components/SoundSettingsDialog";
import {
  configureRecoverySound,
  playRecoverySound,
  primeRecoverySound,
} from "./features/sound/services/recoverySound";
import {
  loadSoundSettings,
  saveSoundSettings,
} from "./features/sound/services/soundSettingsStorage";
import type { SoundSettings } from "./features/sound/types/soundSettings";
import { sendPostureSignal } from "./lib/desktopBridge";

type StartupPhase = "intro" | "calibrating" | "active";

function App() {
  const [startupPhase, setStartupPhase] = useState<StartupPhase>("intro");
  const [isStartPending, setIsStartPending] = useState(false);
  const [isOverlayEnabled, setIsOverlayEnabled] = useState(true);
  const [permissionPopupMessage, setPermissionPopupMessage] = useState<
    string | null
  >(null);
  const trackingEnabled = startupPhase !== "intro";
  const {
    videoRef,
    canvasRef,
    ready,
    status,
    isBadPosture,
    snapshot,
    experimentHistory,
    resetPostureEngine,
  } = usePostureTracking({
    enabled: trackingEnabled,
    overlayEnabled: isOverlayEnabled,
  });

  const [isPairingDialogOpen, setIsPairingDialogOpen] = useState(false);
  const [isSoundDialogOpen, setIsSoundDialogOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() =>
    loadSoundSettings(),
  );

  const isActiveSession = startupPhase === "active";
  const effectiveBadPosture = isActiveSession && isBadPosture;

  const warmupRemainingMs = Math.max(0, snapshot.warmupRemainingMs);
  const warmupSeconds = Math.max(0, Math.ceil(warmupRemainingMs / 1000));
  const calibrationProgress = Math.min(
    100,
    Math.max(
      0,
      ((POSTURE_SPEC.warmupMs - warmupRemainingMs) / POSTURE_SPEC.warmupMs) * 100,
    ),
  );

  const permissionPopup = permissionPopupMessage ? (
    <section className="permission-popup-backdrop" role="dialog" aria-modal="true">
      <div className="permission-popup">
        <h2>カメラ権限を確認してください</h2>
        <p>{permissionPopupMessage}</p>
        <button
          type="button"
          className="permission-popup-close"
          onClick={() => setPermissionPopupMessage(null)}
        >
          閉じる
        </button>
      </div>
    </section>
  ) : null;

  const handleStartMeasurement = async () => {
    if (isStartPending) {
      return;
    }

    setIsStartPending(true);

    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setPermissionPopupMessage(
          "この環境ではカメラを利用できません。ブラウザーまたはOS設定をご確認ください。",
        );
        return;
      }

      if (
        typeof navigator.permissions !== "undefined" &&
        typeof navigator.permissions.query === "function"
      ) {
        try {
          const cameraPermission = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });

          if (cameraPermission.state === "denied") {
            setPermissionPopupMessage(
              "カメラ権限がオフになっています。OSまたはブラウザーの設定でこのアプリにカメラを許可してから、もう一度お試しください。",
            );
            return;
          }
        } catch {
          // 権限状態を事前取得できない環境では通常フローを継続する。
        }
      }

      setStartupPhase("calibrating");
      void primeRecoverySound();
    } finally {
      setIsStartPending(false);
    }
  };

  const handlePostureChanged = useCallback(async (isBad: boolean) => {
    await Promise.allSettled([
      sendPostureSignal(isBad),
      invoke("overlay_on_posture_change", { isBad }),
    ]);
  }, []);

  const handlePostureRecovered = useCallback(async () => {
    await playRecoverySound();
  }, []);

  usePostureTransitionEffects({
    isBadPosture: effectiveBadPosture,
    onPostureChanged: handlePostureChanged,
    onRecovered: handlePostureRecovered,
  });

  useEffect(() => {
    if (startupPhase !== "calibrating") {
      return;
    }

    if (!ready || !snapshot.baselineReady) {
      return;
    }

    setStartupPhase("active");
  }, [ready, snapshot.baselineReady, startupPhase]);

  useEffect(() => {
    if (startupPhase !== "calibrating") {
      return;
    }

    const lowerStatus = status.toLowerCase();
    const isPermissionError =
      lowerStatus.includes("notallowederror") ||
      lowerStatus.includes("permission denied") ||
      lowerStatus.includes("permission");

    if (!isPermissionError) {
      return;
    }

    setPermissionPopupMessage(
      "カメラ権限が無効のため測定を開始できませんでした。設定でカメラを許可してから再度開始してください。",
    );
    setStartupPhase("intro");
  }, [startupPhase, status]);

  useEffect(() => {
    configureRecoverySound({
      enabled: soundSettings.enabled,
      src: soundSettings.selectedSound,
      volume: soundSettings.volume,
    });
    saveSoundSettings(soundSettings);
  }, [soundSettings]);

  useEffect(() => {
    return () => {
      void Promise.allSettled([
        sendPostureSignal(false),
        invoke("overlay_on_posture_change", { isBad: false }),
      ]);
    };
  }, []);

  if (startupPhase === "intro") {
    return (
      <>
        <main className="startup-shell">
          <section className="startup-card">
            <h1>姿勢カメラトラッカー</h1>
            <p className="startup-copy">
              測定を始める前に、椅子に深く座り、画面の正面を向いてください。
            </p>
            <p className="startup-copy">
              開始ボタンを押すとカメラ権限を確認し、5秒間で基準姿勢を学習します。
            </p>
            <button
              type="button"
              className="startup-start"
              onClick={() => {
                void handleStartMeasurement();
              }}
              disabled={isStartPending}
            >
              {isStartPending ? "確認中..." : "測定を開始"}
            </button>
          </section>
        </main>
        {permissionPopup}
      </>
    );
  }

  if (startupPhase === "calibrating") {
    return (
      <>
        <main className="startup-shell startup-shell--calibrating">
          <section className="startup-card startup-card--calibrating">
            <h1>基準姿勢を測定中</h1>
            <p className="startup-copy">
              肩の力を抜き、正面を向いたままお待ちください。
            </p>

            <section className="calibration-viewer" aria-live="polite">
              <video ref={videoRef} className="camera" playsInline muted />
              <canvas ref={canvasRef} className="overlay" />
              <div className="calibration-overlay">
                <span className="calibration-state">
                  {ready ? "測定中" : "カメラ準備中"}
                </span>
                <strong className="calibration-countdown">
                  {ready ? `${warmupSeconds}s` : "--"}
                </strong>
                <p>カウントダウン終了後に本画面へ移動します。</p>
                <div className="calibration-progress" aria-hidden="true">
                  <span style={{ width: `${calibrationProgress}%` }} />
                </div>
              </div>
            </section>

            <div className={`status ${ready ? "ok" : "warn"}`}>{status}</div>
          </section>
        </main>
        {permissionPopup}
      </>
    );
  }

  return (
    <>
      <main className="app-shell">
        <section className="hero">
          <div className="hero-topline">
            <div>
              <h1>姿勢カメラトラッカー</h1>
              <div className={`status ${ready ? "ok" : "warn"}`}>{status}</div>
            </div>

            <div className="hero-actions">
              <button
                type="button"
                className="pairing-launch"
                onClick={() => setIsPairingDialogOpen(true)}
              >
                モバイル連携
              </button>
              <button
                type="button"
                className="sound-launch"
                onClick={() => setIsSoundDialogOpen(true)}
              >
                サウンド設定
              </button>
            </div>
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
            isBadPosture={effectiveBadPosture}
            isOverlayEnabled={isOverlayEnabled}
            experiment={snapshot.experiment}
            onOverlayEnabledChange={setIsOverlayEnabled}
          />
        </section>

        {isPairingDialogOpen ? (
          <PairingDialog onClose={() => setIsPairingDialogOpen(false)} />
        ) : null}
        {isSoundDialogOpen ? (
          <SoundSettingsDialog
            settings={soundSettings}
            onChange={setSoundSettings}
            onClose={() => setIsSoundDialogOpen(false)}
            onPreview={() => {
              void primeRecoverySound();
              void playRecoverySound();
            }}
          />
        ) : null}
      </main>
      {permissionPopup}
    </>
  );
}

export default App;
