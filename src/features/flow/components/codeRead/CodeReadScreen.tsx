import { useEffect, useMemo, useRef, useState } from "react";

import { playSoundPreview } from "../../../sound/services/recoverySound";
import { BUILTIN_SOUND_OPTIONS } from "../../../sound/types/soundSettings";
import type { CodeReadScreenProps } from "../flowScreenTypes";
import { FlowBrand } from "../shared/FlowBrand";
import { buildFrame53SoundLabel } from "../shared/soundLabels";

function stopPreviewStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function CodeReadScreen({
  isStartPending,
  soundSettings,
  onSoundSettingsChange,
  isCharacterOverlayEnabled,
  onCharacterOverlayEnabledChange,
  onStartMeasurement,
  onBackHome,
}: CodeReadScreenProps) {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const volumePreviewTimerRef = useRef<number | null>(null);
  const [cameraPreview, setCameraPreview] = useState<"loading" | "live" | "error">(
    "loading",
  );

  function scheduleSoundVolumePreview(volume: number, selectedSrc: string) {
    if (volumePreviewTimerRef.current !== null) {
      clearTimeout(volumePreviewTimerRef.current);
    }
    volumePreviewTimerRef.current = window.setTimeout(() => {
      volumePreviewTimerRef.current = null;
      void playSoundPreview({ src: selectedSrc, volume });
    }, 220);
  }

  useEffect(() => {
    let cancelled = false;

    async function attachPreview() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setCameraPreview("error");
        return;
      }

      try {
        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }).catch(() =>
            navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
          );

        if (cancelled) {
          stopPreviewStream(stream);
          return;
        }

        previewStreamRef.current = stream;
        const el = previewVideoRef.current;
        if (!el) {
          stopPreviewStream(stream);
          previewStreamRef.current = null;
          if (!cancelled) {
            setCameraPreview("error");
          }
          return;
        }

        el.srcObject = stream;
        void el.play().then(
          () => {
            if (!cancelled) {
              setCameraPreview("live");
            }
          },
          () => {
            if (!cancelled) {
              setCameraPreview("error");
            }
          },
        );
      } catch {
        if (!cancelled) {
          setCameraPreview("error");
        }
      }
    }

    void attachPreview();

    return () => {
      cancelled = true;
      stopPreviewStream(previewStreamRef.current);
      previewStreamRef.current = null;
      const el = previewVideoRef.current;
      if (el) {
        el.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (volumePreviewTimerRef.current !== null) {
        clearTimeout(volumePreviewTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onBackHome();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackHome]);

  const soundOptionList = useMemo(() => {
    return Array.from(
      new Set([
        ...BUILTIN_SOUND_OPTIONS,
        ...soundSettings.customSounds,
      ]),
    );
  }, [soundSettings.customSounds]);

  return (
    <main className="flow-screen frame53-register-screen">
      <FlowBrand />
      <div className="frame53-panels-wrap">
        <section className="frame53-left" aria-labelledby="frame53-register-heading">
          <h1 id="frame53-register-heading" className="frame53-heading">
            姿勢登録
          </h1>
          <p className="frame53-led">
            肩の力を抜いて、背筋を伸ばしてください。
          </p>
          <hr className="frame53-rule" />
          <div className="frame53-toggle-strip">
            <span
              id="frame53-switch-pin-label"
              className="frame53-toggle-strip-label"
            >
              ピンアナゴ表示
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${isCharacterOverlayEnabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={isCharacterOverlayEnabled}
              aria-labelledby="frame53-switch-pin-label"
              onClick={() =>
                onCharacterOverlayEnabledChange(!isCharacterOverlayEnabled)
              }
            >
              <span
                className="frame53-toggle-strip-switch-knob"
                aria-hidden
              />
            </button>
          </div>
          <div className="frame53-toggle-strip">
            <span
              id="frame53-switch-sound-label"
              className="frame53-toggle-strip-label"
            >
              サウンド
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${soundSettings.enabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={soundSettings.enabled}
              aria-labelledby="frame53-switch-sound-label"
              onClick={() =>
                onSoundSettingsChange({
                  ...soundSettings,
                  enabled: !soundSettings.enabled,
                })
              }
            >
              <span
                className="frame53-toggle-strip-switch-knob"
                aria-hidden
              />
            </button>
          </div>

          <div
            className={`frame53-sound-card ${!soundSettings.enabled ? "frame53-muted" : ""}`}
          >
            <label className="frame53-volume-row" htmlFor="frame53-volume">
              <span className="frame53-volume-visible-label">音量</span>
              <input
                id="frame53-volume"
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
                  scheduleSoundVolumePreview(
                    volume,
                    soundSettings.selectedSound,
                  );
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

          <div className="frame53-footer">
            <button
              type="button"
              className="frame53-primary"
              onClick={onStartMeasurement}
              disabled={isStartPending}
            >
              {isStartPending ? "準備中…" : "はじめる"}
            </button>
          </div>
        </section>
        <section
          className="frame53-camera-panel"
          aria-label="カメラプレビュー"
        >
          <video
            ref={previewVideoRef}
            className="frame53-camera-video"
            playsInline
            muted
            aria-hidden="true"
          />
          {cameraPreview !== "live" ? (
            <p
              className="frame53-camera-overlay-text"
              aria-live="polite"
            >
              {cameraPreview === "error"
                ? "カメラを開始できません"
                : "カメラ"}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
