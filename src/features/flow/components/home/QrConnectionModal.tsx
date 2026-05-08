import { useEffect, useState } from "react";

import type { CharacterDefinition } from "../../../characters/types";
import { CharacterFigure } from "../shared/CharacterFigure";
import { SHOW_DEBUG_FLOW_CONTROLS } from "../shared/debugFlags";
import { FlowBrand } from "../shared/FlowBrand";

type QrConnectionModalProps = {
  qrImageDataUrl: string;
  isPairingLoading: boolean;
  pairingError: string | null;
  isPaired: boolean;
  deviceName: string | null;
  featuredCharacter: CharacterDefinition | null;
  onRefresh: () => void;
  onNext: () => void;
  onClose: () => void;
};

export function QrConnectionModal({
  qrImageDataUrl,
  isPairingLoading,
  pairingError,
  isPaired,
  featuredCharacter,
  onRefresh,
  onNext,
  onClose,
}: QrConnectionModalProps) {
  const [debugForceStep2, setDebugForceStep2] = useState(false);
  const [pairedAdvanceToStep2, setPairedAdvanceToStep2] = useState(false);
  const [soundHapticOn, setSoundHapticOn] = useState(true);

  useEffect(() => {
    if (!isPaired) {
      setPairedAdvanceToStep2(false);
    } else {
      // 「次へ」を出さず、ペア完了で自動的にステップ2へ
      setPairedAdvanceToStep2(true);
    }
  }, [isPaired]);

  const step: 1 | 2 =
    SHOW_DEBUG_FLOW_CONTROLS && debugForceStep2
      ? 2
      : isPaired && pairedAdvanceToStep2
        ? 2
        : 1;

  return (
    <div className="qr-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="qr-modal-heading">
      <div className="qr-modal-brand">
        <FlowBrand />
      </div>
      <button
        type="button"
        className="qr-modal-close"
        onClick={onClose}
        aria-label="閉じる"
      >
        ×
      </button>
      <div className="qr-modal-panels">
        <div className={`qr-modal-left qr-modal-left--step${step}`}>
          {step === 1 ? (
            <>
              <h2 id="qr-modal-heading" className="qr-modal-title">
                スマホと接続
              </h2>
              <p className="qr-modal-subtitle">
                スマートフォンでQRを読み込んでください
              </p>
              <div className="qr-modal-phone-area">
                <img
                  src="/phone_QR.png"
                  alt=""
                  className="qr-modal-phone-img"
                  draggable={false}
                  aria-hidden="true"
                />
              </div>
              {pairingError ? (
                <p className="qr-modal-error-label">{pairingError}</p>
              ) : null}
            </>
          ) : (
            <>
              <h2 id="qr-modal-heading" className="qr-modal-title">
                接続完了
              </h2>
              <p className="qr-modal-subtitle">
                スマホの触覚をONにしてください
              </p>
              <div className="qr-modal-sound-haptic-toggle-row">
                <span className="qr-modal-sound-haptic-toggle-label" id="qr-haptic-toggle-label">
                  サウンドと触覚
                </span>
                <button
                  type="button"
                  className={`qr-modal-sound-haptic-switch ${soundHapticOn ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={soundHapticOn}
                  aria-labelledby="qr-haptic-toggle-label"
                  onClick={() => setSoundHapticOn((v) => !v)}
                >
                  <span className="qr-modal-sound-haptic-switch-knob" aria-hidden />
                </button>
              </div>
              <div
                className={`qr-modal-vibe-area ${soundHapticOn ? "is-haptic-on" : "is-haptic-off"}`}
              >
                <div className="qr-modal-vibe-stage">
                  <span
                    className="qr-modal-vibe-arcs qr-modal-vibe-arcs--left"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 40 80"
                      fill="none"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <path d="M34 8 C 14 26 14 54 34 72" />
                      <path d="M24 16 C 10 30 10 50 24 64" />
                      <path d="M14 24 C 6 34 6 46 14 56" />
                    </svg>
                  </span>
                  <img
                    src="/phone.png"
                    alt=""
                    className="qr-modal-vibe-img"
                    draggable={false}
                    aria-hidden="true"
                  />
                  <span
                    className="qr-modal-vibe-arcs qr-modal-vibe-arcs--right"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 40 80"
                      fill="none"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <path d="M6 8 C 26 26 26 54 6 72" />
                      <path d="M16 16 C 30 30 30 50 16 64" />
                      <path d="M26 24 C 34 34 34 46 26 56" />
                    </svg>
                  </span>
                </div>
              </div>
            </>
          )}
          {step === 2 ? (
            <button type="button" className="qr-modal-next-btn" onClick={() => onNext()}>
              次へ
            </button>
          ) : null}
        </div>

        {step === 1 ? (
          <div className="qr-modal-right-col">
            <div className="qr-modal-right qr-modal-right--step1">
              <div className="qr-modal-qr-stack">
                <div className="qr-modal-qr-composite">
                  <div className="qr-modal-qr-white-mat" aria-hidden />
                  <img
                    src="/logo/QRアナゴ.png"
                    alt=""
                    className="qr-modal-qr-anago-behind"
                    draggable={false}
                    aria-hidden="true"
                  />
                  {qrImageDataUrl ? (
                    <img
                      src={qrImageDataUrl}
                      alt="ペアリングQRコード"
                      className="qr-modal-qr-image"
                    />
                  ) : (
                    <div className="qr-modal-qr-placeholder">
                      {isPairingLoading ? "QR準備中..." : "QRを表示できません"}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {qrImageDataUrl ? (
              <button
                type="button"
                className="qr-modal-refresh-btn"
                onClick={onRefresh}
              >
                QRを更新
              </button>
            ) : null}
          </div>
        ) : (
          <div className="qr-modal-right-col qr-modal-right-col--step2">
            <div className="qr-modal-right qr-modal-right--step2">
              <div id="qr-today-teaser" className="qr-modal-today-teaser">
                <p className="qr-modal-today-heading">今日のピンアナゴ</p>
                <div className="qr-modal-today-character qr-modal-today-character--animated">
                  <CharacterFigure
                    character={featuredCharacter}
                    className="qr-modal-today-character-img"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {SHOW_DEBUG_FLOW_CONTROLS ? (
        <div className="qr-modal-debug-actions">
          <button
            type="button"
            className="home-single-debug-skip qr-modal-debug-skip"
            onClick={onNext}
          >
            DEBUG: QRスキップ
          </button>
          <button
            type="button"
            className="home-single-debug-skip qr-modal-debug-step2"
            onClick={() => setDebugForceStep2((v) => !v)}
          >
            DEBUG: Step2 {debugForceStep2 ? "OFF" : "プレビュー"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
