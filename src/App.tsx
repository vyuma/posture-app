import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
type OverlayMode = "hidden" | "good" | "bad" | "paused";
type OverlayStatePayload = {
  mode: OverlayMode;
  userHidden: boolean;
  offsetX: number;
  offsetY: number;
};

const CHARACTER_OVERLAY_STORAGE_KEY = "posture.overlay.characterVisible.v1";
const OVERLAY_OFFSET_STORAGE_KEY = "posture.overlay.positionOffset.v1";

function App() {
  const [startupPhase, setStartupPhase] = useState<StartupPhase>("intro");
  const [isStartPending, setIsStartPending] = useState(false);
  const [isOverlayEnabled, setIsOverlayEnabled] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isCharacterOverlayEnabled, setIsCharacterOverlayEnabled] = useState(() =>
    loadCharacterOverlayEnabled(),
  );
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
    paused: isPaused,
  });

  const [isPairingDialogOpen, setIsPairingDialogOpen] = useState(false);
  const [isSoundDialogOpen, setIsSoundDialogOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() =>
    loadSoundSettings(),
  );

  const isActiveSession = startupPhase === "active";
  const effectiveBadPosture = isActiveSession && !isPaused && isBadPosture;

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

      setIsPaused(false);
      setStartupPhase("calibrating");
      void primeRecoverySound();
    } finally {
      setIsStartPending(false);
    }
  };

  const handlePostureChanged = useCallback(async (isBad: boolean) => {
    await Promise.allSettled([sendPostureSignal(isBad)]);
  }, []);

  const handlePostureRecovered = useCallback(async () => {
    if (isPaused) {
      return;
    }

    await playRecoverySound();
  }, [isPaused]);

  usePostureTransitionEffects({
    isBadPosture: effectiveBadPosture,
    onPostureChanged: handlePostureChanged,
    onRecovered: handlePostureRecovered,
  });

  useEffect(() => {
    let disposed = false;

    const applyOverlayState = (state: OverlayStatePayload) => {
      if (!disposed) {
        const visible = !state.userHidden;
        setIsCharacterOverlayEnabled(visible);
        saveCharacterOverlayEnabled(visible);
      }
    };

    void invoke<OverlayStatePayload>("overlay_get_state")
      .then(applyOverlayState)
      .catch(() => {
        // Browser preview cannot reach Tauri commands.
      });

    const unlistenPromise = listen<OverlayStatePayload>(
      "overlay:state",
      ({ payload }) => {
        applyOverlayState(payload);
      },
    );

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const mode: OverlayMode = isActiveSession
      ? isPaused
        ? "paused"
        : isBadPosture
          ? "bad"
          : "good"
      : "hidden";

    const syncOverlay = async () => {
      if (!isCharacterOverlayEnabled) {
        saveCharacterOverlayEnabled(false);
        await invoke("overlay_hide_character").catch(() => {});
        await invoke("overlay_set_mode", { mode }).catch(() => {});
        return;
      }

      saveCharacterOverlayEnabled(true);

      if (mode === "hidden") {
        await invoke("overlay_set_mode", { mode }).catch(() => {});
        await invoke("overlay_show_character").catch(() => {});
        return;
      }

      await invoke("overlay_show_character").catch(() => {});
      await invoke("overlay_set_mode", { mode }).catch(() => {});
    };

    void syncOverlay();
  }, [isActiveSession, isBadPosture, isCharacterOverlayEnabled, isPaused]);

  const handleShowCharacterOverlay = useCallback(() => {
    setIsCharacterOverlayEnabled(true);
  }, []);

  const handleResetCharacterPosition = useCallback(() => {
    try {
      window.localStorage.removeItem(OVERLAY_OFFSET_STORAGE_KEY);
    } catch {
      // Ignore storage failures in browser preview.
    }

    void invoke("overlay_reset_position_offset").catch(() => {
      // Browser preview cannot reach Tauri commands.
    });
  }, []);

  useEffect(() => {
    if (!isPaused) {
      return;
    }

    void Promise.allSettled([sendPostureSignal(false)]);
  }, [isPaused]);

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
        invoke("overlay_set_mode", { mode: "hidden" }),
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
                className={`pause-launch ${isPaused ? "active" : ""}`}
                onClick={() => setIsPaused((current) => !current)}
              >
                {isPaused ? "再開" : "一時停止"}
              </button>
              {!isCharacterOverlayEnabled ? (
                <button
                  type="button"
                  className="character-launch"
                  onClick={handleShowCharacterOverlay}
                >
                  キャラを表示
                </button>
              ) : null}
              <button
                type="button"
                className="character-reset-launch"
                onClick={handleResetCharacterPosition}
              >
                位置リセット
              </button>
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
            isCharacterOverlayEnabled={isCharacterOverlayEnabled}
            experiment={snapshot.experiment}
            onOverlayEnabledChange={setIsOverlayEnabled}
            onCharacterOverlayEnabledChange={setIsCharacterOverlayEnabled}
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

function loadCharacterOverlayEnabled() {
  try {
    return window.localStorage.getItem(CHARACTER_OVERLAY_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveCharacterOverlayEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(
      CHARACTER_OVERLAY_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

export default App;
