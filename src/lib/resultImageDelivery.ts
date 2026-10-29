import { copyShareImageNative, shouldPreferNativeClipboardShare } from "./shareNativeClipboard";

export type ShareResultOutcome =
  | "shared"
  | "downloaded"
  | "copied"
  | "aborted";
export type ShareResultAction = "auto" | "share" | "copy" | "download";

function isAbortError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "name" in err &&
    String((err as { name?: string }).name) === "AbortError"
  );
}

async function copyBlobToClipboard(pendingBlob: Promise<Blob>): Promise<boolean> {
  if (shouldPreferNativeClipboardShare() && await copyShareImageNative(await pendingBlob)) {
    return true;
  }

  if (
    typeof navigator === "undefined" ||
    navigator.clipboard?.write === undefined ||
    typeof ClipboardItem === "undefined"
  ) {
    return false;
  }

  const clipboardItemSupport = ClipboardItem as typeof ClipboardItem & {
    supports?: (type: string) => boolean;
  };
  if (
    typeof clipboardItemSupport.supports === "function" &&
    !clipboardItemSupport.supports("image/png")
  ) {
    return false;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": pendingBlob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

/** Desktop copy uses one image representation; mobile keeps the native share sheet. */
function isMobileShareSurface(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export async function deliverResultImage(
  pendingBlob: Promise<Blob>,
  action: ShareResultAction = "auto",
): Promise<ShareResultOutcome> {
  const copyFirst = action === "copy" || (action === "auto" && !isMobileShareSurface());
  // Register the promise-backed clipboard write during the click. Awaiting capture
  // first loses user activation in WebKit. Never add HTML, text or a file URL.
  if (copyFirst && await copyBlobToClipboard(pendingBlob)) return "copied";

  const blob = await pendingBlob;
  const file = new File([blob], `pinn-result-${Date.now()}.png`, { type: "image/png" });
  if (action === "download" || copyFirst) {
    downloadBlob(blob, file.name);
    return "downloaded";
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    let canShareFiles = typeof navigator.canShare !== "function";
    try { canShareFiles ||= navigator.canShare({ files: [file] }); } catch { /* unsupported */ }
    if (canShareFiles) {
      try {
        await navigator.share({ files: [file] });
        return "shared";
      } catch (error) {
        if (isAbortError(error)) return "aborted";
      }
    }
  }

  if (await copyBlobToClipboard(Promise.resolve(blob))) return "copied";
  downloadBlob(blob, file.name);
  return "downloaded";
}
