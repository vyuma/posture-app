import { useEffect, useState } from "react";

import type { OverlayMode } from "./overlayState";

const CHARACTER_SRC: Record<Exclude<OverlayMode, "hidden">, string> = {
  good: "/characters/anago/normal-nago/expressions/good.png",
  bad: "/characters/anago/normal-nago/expressions/bad.png",
  paused: "/characters/anago/normal-nago/expressions/paused.png",
};

/** OverlayApp.tsx と同値：姿勢が悪いと下へ沈み、ほぼ見えなくなるまで進む */
const BAD_SINK_MAX_PX = 136;
const BAD_SINK_PX_PER_SECOND = 34;

type WebInlineCharacterOverlayProps = {
  mode: Exclude<OverlayMode, "hidden">;
};

/**
 * ブラウザ版：別ウィンドウの Tauri オーバーレイの代わりに、viewport 右下へキャラを重ねる。
 */
export function WebInlineCharacterOverlay({ mode }: WebInlineCharacterOverlayProps) {
  const [badSinkPx, setBadSinkPx] = useState(0);

  useEffect(() => {
    if (mode !== "bad") {
      setBadSinkPx(0);
      return;
    }

    const badStartedAt = performance.now();
    setBadSinkPx(0);

    const intervalId = window.setInterval(() => {
      const elapsedSeconds = (performance.now() - badStartedAt) / 1000;
      setBadSinkPx(
        Math.min(BAD_SINK_MAX_PX, elapsedSeconds * BAD_SINK_PX_PER_SECOND),
      );
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [mode]);

  const sinkStyle =
    mode === "bad"
      ? { transform: `translateY(${badSinkPx}px)` }
      : undefined;

  return (
    <div
      className={`web-inline-character-overlay web-inline-character-overlay--${mode}`}
      aria-hidden
    >
      <div className="web-inline-character-sink" style={sinkStyle}>
        <div className="web-inline-character">
          <img src={CHARACTER_SRC[mode]} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}
