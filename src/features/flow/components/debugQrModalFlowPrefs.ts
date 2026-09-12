/** QR 接続モーダルの Step2 プレビューをプロフィール内の DEBUG から切り替える。 */
let debugPreviewStep2 = false;
const listeners = new Set<() => void>();

export function subscribeDebugQrModalStep2Preview(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDebugQrModalStep2Preview(): boolean {
  return debugPreviewStep2;
}

export function setDebugQrModalStep2Preview(next: boolean): void {
  if (debugPreviewStep2 === next) {
    return;
  }

  debugPreviewStep2 = next;
  listeners.forEach((listener) => listener());
}

export function toggleDebugQrModalStep2Preview(): void {
  setDebugQrModalStep2Preview(!debugPreviewStep2);
}
