import { toBlob } from "html-to-image";

export type ShareResultOutcome =
  | "shared"
  | "downloaded"
  | "copied"
  | "aborted";

/**
 * 測定結果カード領域を PNG にして共有（navigator.share の files）→失敗時はダウンロード。
 * ユーザーが共有シートをキャンセルした場合はダウンロードしない。
 */
export async function shareResultCapture(
  element: HTMLElement,
): Promise<ShareResultOutcome> {
  const blob = await toBlob(element, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "transparent",
    // 型定義にはないがランタイムでは有効なオプション。画像が抜ける環境向けに CORS を有効化する。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...( { useCORS: true } as any),
  });

  if (!blob) {
    throw new Error("Capture failed");
  }

  const file = new File([blob], `pinn-result-${Date.now()}.png`, {
    type: "image/png",
  });

  const canWebShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (canWebShareFiles) {
    try {
      await navigator.share({
        title: "Piin",
        text: "Piinでチンアナゴを獲得しました！",
        files: [file],
      });
      return "shared";
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      if (name === "AbortError") {
        return "aborted";
      }
      // そのほかのエラーはフォールバックへ
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.rel = "noopener";
      anchor.click();
      return "downloaded";
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.write !== undefined &&
      typeof ClipboardItem !== "undefined"
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({ [file.type]: blob }),
      ]);
      return "copied";
    }
    throw new Error("Save and clipboard both failed");
  }
}
