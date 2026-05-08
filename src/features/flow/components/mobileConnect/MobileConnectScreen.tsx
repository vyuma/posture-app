import { type CSSProperties, useEffect, useState } from "react";

import type { MobileConnectScreenProps } from "../flowScreenTypes";
import { SHOW_DEBUG_FLOW_CONTROLS } from "../shared/debugFlags";
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
  onRefreshPairing,
  onContinueFromPaired,
  onBackHome,
}: MobileConnectScreenProps) {
  const [sceneScale, setSceneScale] = useState(() => getMobileConnectSceneScale());

  useEffect(() => {
    if (!isPaired) {
      return;
    }

    onContinueFromPaired();
  }, [isPaired, onContinueFromPaired]);

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

        <section className="mobile-connect-content" aria-label="スマホと接続">
          <article className="mobile-connect-left-card">
            <h1>スマホと接続</h1>
            <p>スマホアプリでQRをスキャンしてください。</p>
            <img
              src="/mobile_piiin.png"
              alt="Piiin mobile app preview"
              className="mobile-connect-phone-preview"
              draggable={false}
            />
          </article>

          <article className="mobile-connect-right-card" aria-live="polite">
            <div className="mobile-connect-qr-stand">
              <div className="mobile-connect-qr-pole" aria-hidden="true" />
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
          </article>
        </section>

        {pairingError ? (
          <p className="mobile-connect-error" role="alert">
            {pairingError}
          </p>
        ) : null}

        {SHOW_DEBUG_FLOW_CONTROLS ? (
          <div className="mobile-connect-debug-actions">
            <button
              type="button"
              className="secondary-pill mobile-connect-debug-refresh"
              onClick={onRefreshPairing}
            >
              DEBUG: QR更新
            </button>
            <button
              type="button"
              className="primary-pill mobile-connect-debug-skip"
              onClick={onContinueFromPaired}
            >
              DEBUG: QRスキップ
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
