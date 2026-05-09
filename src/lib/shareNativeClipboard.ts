import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./tauriRuntime";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("readAsDataURL failed"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(blob);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid data URL");
  }
  return dataUrl.slice(commaIndex + 1);
}

export function shouldPreferNativeClipboardShare(): boolean {
  return (
    isTauriRuntime() &&
    typeof navigator !== "undefined" &&
    /\bWindows\b/i.test(navigator.userAgent)
  );
}

export async function copyShareImageNative(blob: Blob): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }

  try {
    await invoke("copy_share_image_to_clipboard", {
      pngBase64: await blobToBase64(blob),
    });
    return true;
  } catch (error) {
    console.warn("Failed to copy share image with native clipboard", error);
    return false;
  }
}
