/**
 * 本体UIからオーバーレイwebviewへ配置ヒント再表示を依頼するときのイベント名。
 * WebviewWindow label は src-tauri overlay/window.rs の OVERLAY_LABEL と一致させる。
 */
export const OVERLAY_PLACEMENT_HINT_REFRESH_EVENT =
  "overlay:placement_hint_refresh";

export const OVERLAY_WEBVIEW_WINDOW_LABEL = "cat_overlay";

/**
 * @returns Tauri で emitTo に成功したか（ブラウザプレビュー等では false）
 */
export async function emitOverlayPlacementHintRefresh(): Promise<boolean> {
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo(
      OVERLAY_WEBVIEW_WINDOW_LABEL,
      OVERLAY_PLACEMENT_HINT_REFRESH_EVENT,
    );
    return true;
  } catch {
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit(OVERLAY_PLACEMENT_HINT_REFRESH_EVENT);
      return true;
    } catch {
      return false;
    }
  }
}
