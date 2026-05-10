import { useEffect, useRef, useState } from "react";

import { useLiveFigmaPrScaleStyle } from "../../hooks/useLiveFigmaPrScaleStyle";
import type { CodeReadScreenProps } from "../flowScreenTypes";
import { FlowBrand } from "../shared/FlowBrand";
import { CodeReadSettingsPanel } from "./CodeReadSettingsPanel";

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
  const figmaPrScaleStyle = useLiveFigmaPrScaleStyle();

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [cameraPreview, setCameraPreview] = useState<"loading" | "live" | "error">(
    "loading",
  );

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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onBackHome();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackHome]);

  return (
    <main
      className="flow-screen frame53-register-screen"
      style={figmaPrScaleStyle}
    >
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
          <CodeReadSettingsPanel
            soundSettings={soundSettings}
            onSoundSettingsChange={onSoundSettingsChange}
            isCharacterOverlayEnabled={isCharacterOverlayEnabled}
            onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
          />

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
