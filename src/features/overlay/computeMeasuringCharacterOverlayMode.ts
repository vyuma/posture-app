import type { AppFlowPhase } from "../flow/types";
import type { OverlayMode } from "./overlayState";

/**
 * App.tsx の Tauri オーバーレイ同期と同じモード判定（測定フェーズのみ）。
 */
export function computeMeasuringCharacterOverlayMode(
  flowPhase: AppFlowPhase,
  isPaused: boolean,
  baselineReady: boolean,
  isBadPosture: boolean,
): OverlayMode {
  if (flowPhase !== "measuring") {
    return "hidden";
  }
  if (isPaused) {
    return "paused";
  }
  if (!baselineReady) {
    return "hidden";
  }
  return isBadPosture ? "bad" : "good";
}
