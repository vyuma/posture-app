import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useState } from "react";

import { computeFigmaScenePrScale } from "../utils/figmaSceneScale";

/**
 * `visualViewport` 変化で `--pr-scale` を同期（Frame53 登録フロー用）。
 * スケールは 1512×982 が viewport に収まる raw を上限 1.35 で抑える（computeFigmaScenePrScale）。
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
