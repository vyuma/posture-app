/**
 * Tauri WebView 上で実行中かどうか。
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return false;
  }
  return true;
}
