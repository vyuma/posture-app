import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useState } from "react";

import { computeFigmaScenePrScale } from "../utils/figmaSceneScale";

/**
 * `visualViewport` 変化で `--pr-scale` を同期（Frame53 登録フロー用）。
 * CSS の fallback max/min と同じ clamp は computeFigmaScenePrScale 側で統一。
 */
export function useLiveFigmaPrScaleStyle(): CSSProperties {
  const [scale, setScale] = useState(computeFigmaScenePrScale);

  useLayoutEffect(() => {
    const sync = () => {
      setScale(computeFigmaScenePrScale());
    };

    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, []);

  return useMemo(
    () =>
      ({
        // インラインで上書きし、親の [.frame53-register-screen] の CSS 算出より優先
        "--pr-scale": String(scale),
      }) as CSSProperties,
    [scale],
  );
}
