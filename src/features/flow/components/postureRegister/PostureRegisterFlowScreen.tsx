import { useEffect, useRef, useState } from "react";

import { emitOverlayPlacementHintRefresh } from "../../../overlay/overlayPlacementHintBridge";
import { POSTURE_SPEC, PostureViewer } from "../../../posture";
import { CodeReadSettingsPanel } from "../codeRead/CodeReadSettingsPanel";
import { useLiveFigmaPrScaleStyle } from "../../hooks/useLiveFigmaPrScaleStyle";
import type { PostureRegisterFlowScreenProps } from "../flowScreenTypes";
import { FlowBrand } from "../shared/FlowBrand";
import { WarmupCountdownVeil } from "../measuring/WarmupCountdownVeil";

function stopPreviewStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function PostureRegisterFlowScreen({
  onBackHome,
  postureRegisterStep,
  videoRef,
  canvasRef,
  snapshot,
  isBadPosture,
  isOverlayEnabled,
  isCharacterOverlayEnabled,
  soundSettings,
  onSoundSettingsChange,
  onOverlayEnabledChange,
  onCharacterOverlayEnabledChange,
  isStartPending,
  onRequestBeginCalibrating,
  onBeginMeasurementAfterRegister,
  onCalibratingComplete,
  onResetCharacterPosition,
}: PostureRegisterFlowScreenProps) {
  const figmaPrScaleStyle = useLiveFigmaPrScaleStyle();

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [cameraPreview, setCameraPreview] = useState<
    "loading" | "live" | "error"
  >("loading");

  const showRegisterDevTools = false;

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

  useEffect(() => {
    if (postureRegisterStep !== "intro") {
      return;
    }

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
        const stream = await navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          })
          .catch(() =>
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

    setCameraPreview("loading");
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
  }, [postureRegisterStep]);

  useEffect(() => {
    if (postureRegisterStep !== "calibrating") {
      return;
    }

    if (!snapshot.baselineReady) {
      return;
    }

    onCalibratingComplete();
  }, [
    onCalibratingComplete,
    postureRegisterStep,
    snapshot.baselineReady,
  ]);

  const leftClass =
    postureRegisterStep === "intro"
      ? "frame53-left frame53-left--pr-intro"
      : postureRegisterStep === "calibrating"
        ? "frame53-left frame53-left--pr-calibrating"
        : "frame53-left frame53-left--pr-settings";

  const headingId =
    postureRegisterStep === "intro"
      ? "frame53-pr-intro-heading"
      : postureRegisterStep === "calibrating"
        ? "frame53-pr-cal-heading"
        : "frame53-pr-settings-heading";

  return (
    <main
      className={`flow-screen frame53-register-screen${showRegisterDevTools ? " has-developer-tools" : ""}`}
      style={figmaPrScaleStyle}
    >
      <FlowBrand />
      <button type="button" className="frame53-header-close" onClick={onBackHome} aria-label="閉じる">
        <img src="/x.png" alt="" width={56} height={56} />
      </button>
      <div className="frame53-panels-wrap">
        <section className={leftClass} aria-labelledby={headingId}>
          {postureRegisterStep === "intro" ? (
            <>
              <h1 id={headingId} className="frame53-heading">
                良い姿勢を登録
              </h1>
              <p className="frame53-led">
                肩の力を抜いて、背筋を伸ばして<br />
                5秒間キープしてください。
              </p>
              <div className="frame53-pr-cal-mascot-wrap" aria-hidden="true">
                <img className="frame53-pr-cal-mascot" src="/characters/anago/normal-nago/expressions/happy.png" alt="" width={224} height={359} draggable={false} />
              </div>
              <div className="frame53-footer frame53-footer--pr-intro">
                <button
                  type="button"
                  className="frame53-primary"
                  onClick={() => void onRequestBeginCalibrating()}
                  disabled={isStartPending}
                >
                  {isStartPending ? "準備中…" : "登録を開始"}
                </button>
              </div>
            </>
          ) : null}

          {postureRegisterStep === "calibrating" ? (
            <>
              <h1 id={headingId} className="frame53-heading">
                登録中
              </h1>
              <p className="frame53-led">
                肩の力を抜いて、背筋を伸ばして
                <br />
                5秒間キープしてください。
              </p>
              <div className="frame53-footer frame53-footer--pr-calibrating">
                <div
                  className="frame53-pr-cal-mascot-wrap"
                  aria-hidden="true"
                >
                  <img
                    className="frame53-pr-cal-mascot"
                    src="/characters/anago/normal-nago/expressions/happy.png"
                    alt=""
                    draggable={false}
                  />
                </div>
                <button
                  type="button"
                  className="frame53-primary frame53-primary--pr-calibrating"
                  disabled
                  aria-disabled="true"
                >
                  登録中
                </button>
              </div>
            </>
          ) : null}

          {postureRegisterStep === "settings" ? (
            <>
              <div className="frame53-pr-settings-scroll">
                <h1 id={headingId} className="frame53-heading">
                  登録完了
                </h1>
                <p className="frame53-led">
                  測定中の設定をしてください。
                </p>
                <p className="frame53-led-note">
                  ※ 測定開始後にも変更できます
                </p>
                <CodeReadSettingsPanel
                  idPrefix="frame53-pr"
                  registerCompleteLayout
                  soundSettings={soundSettings}
                  onSoundSettingsChange={onSoundSettingsChange}
                  isCharacterOverlayEnabled={isCharacterOverlayEnabled}
                  onCharacterOverlayEnabledChange={
                    onCharacterOverlayEnabledChange
                  }
                />
                {showRegisterDevTools ? (
                  <div className="measure-debug-tools measure-debug-tools--below-primary frame53-pr-settings-debug">
                    <button
                      type="button"
                      className="tool-pill measure-tool-overlay-hint-debug"
                      title="クリックでデスクトップオーバーレイへ配置ヒント再表示を送る"
                      onClick={() => void handleEmitOverlayPlacementHintRefresh()}
                    >
                      配置ヒント(debug)
                    </button>
                    <button
                      type="button"
                      className="tool-pill"
                      onClick={onResetCharacterPosition}
                    >
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
                ) : null}
              </div>
              <div className="frame53-footer frame53-footer--pr-settings-cta">
                <button
                  type="button"
                  className="frame53-primary"
                  onClick={() => void onBeginMeasurementAfterRegister()}
                  disabled={isStartPending || !snapshot.baselineReady}
                >
                  {isStartPending ? "準備中…" : "姿勢測定を開始"}
                </button>
              </div>
            </>
          ) : null}
        </section>

        <section className="frame53-camera-panel" aria-label="カメラプレビュー">
          <div className="frame53-camera-stack">
            {postureRegisterStep === "intro" ? (
              <>
                <video
                  ref={previewVideoRef}
                  className="frame53-camera-video"
                  playsInline
                  muted
                  aria-hidden="true"
                />
                {cameraPreview !== "live" ? (
                  <p className="frame53-camera-overlay-text" aria-live="polite">
                    {cameraPreview === "error"
                      ? "カメラを開始できません"
                      : "カメラ"}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <PostureViewer
                  variant="measurement"
                  videoRef={videoRef}
                  canvasRef={canvasRef}
                  isBadPosture={isBadPosture}
                  isOverlayEnabled={isOverlayEnabled}
                  isCharacterOverlayEnabled={isCharacterOverlayEnabled}
                  experiment={snapshot.experiment}
                  onOverlayEnabledChange={onOverlayEnabledChange}
                  onCharacterOverlayEnabledChange={
                    onCharacterOverlayEnabledChange
                  }
                />
                {postureRegisterStep === "calibrating" &&
                !snapshot.baselineReady ? (
                  <WarmupCountdownVeil
                    variant="register"
                    remainingMs={snapshot.warmupRemainingMs}
                    totalMs={POSTURE_SPEC.warmupMs}
                    label="良い姿勢を登録中"
                  />
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
