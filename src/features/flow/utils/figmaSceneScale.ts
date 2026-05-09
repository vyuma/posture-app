/** Figma フロー（1512×982）共通の viewport 換算スケール。MobileConnect と Frame53 で同一基準にする */

export const FIGMA_SCENE_WIDTH_PX = 1512;
export const FIGMA_SCENE_HEIGHT_PX = 982;

/** [.flow-screen.frame53-register-screen] 等と同じ下限・上限 */
export const FIGMA_SCENE_PR_SCALE_MIN = 0.31;
export const FIGMA_SCENE_PR_SCALE_MAX = 1.35;

/**
 * visualViewport があればその幅・高さを使う（MobileConnect と同じ）。
 * `--pr-scale` と `transform: scale(...)` で共有する値を返す。
 */
export function computeFigmaScenePrScale(): number {
  if (typeof window === "undefined") {
    return 1;
  }

  const viewport = window.visualViewport;
  const w = viewport?.width ?? window.innerWidth;
  const h = viewport?.height ?? window.innerHeight;

  const raw = Math.min(
    w / FIGMA_SCENE_WIDTH_PX,
    h / FIGMA_SCENE_HEIGHT_PX,
  );

  return Math.min(
    FIGMA_SCENE_PR_SCALE_MAX,
    Math.max(FIGMA_SCENE_PR_SCALE_MIN, raw),
  );
}
