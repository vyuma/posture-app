import { type CSSProperties, useEffect, useState } from "react";

import type { MobileConnectScreenProps } from "../flowScreenTypes";
import { CharacterFigure } from "../shared/CharacterFigure";
import { FlowBrand } from "../shared/FlowBrand";

const MOBILE_CONNECT_SCENE_WIDTH = 1512;
const MOBILE_CONNECT_SCENE_HEIGHT = 982;

type MobileConnectStageStyle = CSSProperties & {
  "--mobile-connect-scale": string;
};

function getMobileConnectSceneScale() {
  if (typeof window === "undefined") {
    return 1;
  }

  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

  return Math.min(
    viewportWidth / MOBILE_CONNECT_SCENE_WIDTH,
    viewportHeight / MOBILE_CONNECT_SCENE_HEIGHT,
  );
}

export function MobileConnectScreen({
  qrImageDataUrl,
  isPairingLoading,
  pairingError,
  isPaired,
  featuredCharacter,
  onContinueFromPaired,
  onBackHome,
}: MobileConnectScreenProps) {
  const [sceneScale, setSceneScale] = useState(() => getMobileConnectSceneScale());

  useEffect(() => {
    const syncSceneScale = () => {
      setSceneScale(getMobileConnectSceneScale());
    };

    syncSceneScale();
    window.addEventListener("resize", syncSceneScale);
    window.visualViewport?.addEventListener("resize", syncSceneScale);

    return () => {
      window.removeEventListener("resize", syncSceneScale);
      window.visualViewport?.removeEventListener("resize", syncSceneScale);
    };
  }, []);

  const stageStyle: MobileConnectStageStyle = {
    "--mobile-connect-scale": sceneScale.toString(),
  };

  return (
    <main className="flow-screen mobile-connect-screen">
      <div className="mobile-connect-stage" style={stageStyle}>
        <header className="mobile-connect-header">
          <FlowBrand />
          <button
            type="button"
            className="mobile-connect-close"
            onClick={onBackHome}
            aria-label="閉じる"
          >
            <img src="/x.png" alt="" width={56} height={56} draggable={false} />
          </button>
        </header>

        <section
          className="mobile-connect-content"
          aria-label={isPaired ? "接続完了" : "スマホと接続"}
        >
          <article
            className={
              isPaired
                ? "mobile-connect-left-card mobile-connect-left-card--paired"
                : "mobile-connect-left-card"
            }
          >
            {isPaired ? (
              <>
                <h1>接続完了</h1>
                <p>スマホの設定で「触覚」をONにしてください。</p>
                <div
                  className="mobile-connect-vibe-area is-haptic-on"
                  aria-hidden="true"
                >
                  <div className="mobile-connect-vibe-stage">
                    <span
                      className="mobile-connect-vibe-arcs mobile-connect-vibe-arcs--left"
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
                      className="mobile-connect-vibe-img"
                      draggable={false}
                      aria-hidden="true"
                    />
                    <span
                      className="mobile-connect-vibe-arcs mobile-connect-vibe-arcs--right"
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
                <button
                  type="button"
                  className="mobile-connect-next-btn"
                  onClick={() => onContinueFromPaired()}
                >
                  次へ
                </button>
              </>
            ) : (
              <>
                <h1>スマホと接続</h1>
                <p>スマホアプリでQRをスキャンしてください。</p>
                <img
                  src="/mobile_piiin.png"
                  alt="Piiin mobile app preview"
                  className="mobile-connect-phone-preview"
                  draggable={false}
                />
              </>
            )}
          </article>

          <article
            className={
              isPaired
                ? "mobile-connect-right-card mobile-connect-right-card--paired"
                : "mobile-connect-right-card"
            }
            aria-live="polite"
          >
            {isPaired ? (
              <div className="mobile-connect-today-teaser">
                <p className="mobile-connect-today-heading">今日のピンアナゴ</p>
                <div className="mobile-connect-today-character mobile-connect-today-character--animated">
                  <CharacterFigure
                    character={featuredCharacter}
                    className="mobile-connect-today-character-img"
                  />
                </div>
              </div>
            ) : (
              <div className="mobile-connect-qr-stand">
                <div className="mobile-connect-qr-frame">
                  <div className="mobile-connect-qr-white-mat" aria-hidden="true" />
                  <img
                    src="/logo/QRアナゴ.png"
                    alt=""
                    className="mobile-connect-qr-anago"
                    draggable={false}
                    aria-hidden="true"
                  />
                  {qrImageDataUrl ? (
                    <img
                      src={qrImageDataUrl}
                      alt="ペアリングQRコード"
                      className="mobile-connect-qr-image"
                    />
                  ) : (
                    <div className="mobile-connect-qr-placeholder">
                      {isPairingLoading ? "QR準備中..." : "QRを表示できません"}
                    </div>
                  )}
                </div>
              </div>
            )}
          </article>
        </section>

        {pairingError && !isPaired ? (
          <p className="mobile-connect-error" role="alert">
            {pairingError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
