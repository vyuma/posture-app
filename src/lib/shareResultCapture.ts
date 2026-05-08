import { toBlob } from "html-to-image";

export type ShareResultOutcome =
  | "shared"
  | "downloaded"
  | "copied"
  | "aborted";

const SHARE_CAPTURE_CLASS = "is-share-capture";
/** キャプチャ用ステージの固定幅（CSS の .is-share-capture と一致させる） */
const CAPTURE_STAGE_WIDTH_PX = 720;
/**
 * 画像インライン化後に painting cycle を確実に走らせるための強制ウェイト（ms）。
 * 短いと初回キャプチャで portrait が空のまま直列化される事故が起きるため、
 * UI の spinner 表示と引き換えに余裕をもって待つ。
 */
const POST_INLINE_PAINT_DELAY_MS = 350;
/** 画像インライン化前のレイアウト確定ウェイト */
const PRE_INLINE_LAYOUT_DELAY_MS = 80;

/**
 * 同一 URL の画像を毎回 fetch し直さないためのモジュールレベルキャッシュ。
 * 初回キャプチャ時に portrait の painting が間に合わず欠落する問題を緩和する目的でもある。
 */
const dataURLCache = new Map<string, string>();

async function waitForImageDecode(img: HTMLImageElement): Promise<void> {
  try {
    await img.decode();
    return;
  } catch {
    // decode 非対応/失敗時は load イベント待ちへフォールバック
  }

  await new Promise<void>((resolve) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
    img.addEventListener("load", onLoad, { once: true });
    img.addEventListener("error", onError, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "name" in err &&
    String((err as { name?: string }).name) === "AbortError"
  );
}

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

/**
 * クローン側の img を data URL 化する。
 * モジュールキャッシュにヒットすればそのまま流用し、なければ fetch して登録する。
 * 元 DOM は触らないため、復元（revert）は不要。
 */
async function inlineImgSourcesForCapture(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  const fetchTasks: Promise<void>[] = [];

  for (const img of images) {
    const srcAttr = img.getAttribute("src") ?? "";
    if (!srcAttr || srcAttr.startsWith("data:")) {
      continue;
    }

    const isHttp = /^https?:\/\//i.test(srcAttr);
    const isAppPath = srcAttr.startsWith("/");
    if (!isHttp && !isAppPath) {
      continue;
    }

    const url = isHttp
      ? srcAttr
      : new URL(srcAttr, window.location.origin).href;

    const cached = dataURLCache.get(url);
    if (cached !== undefined) {
      img.src = cached;
      continue;
    }

    fetchTasks.push(
      (async () => {
        try {
          const res = await fetch(url, {
            mode: "cors",
            credentials: "same-origin",
          });
          if (!res.ok) {
            return;
          }
          const blob = await res.blob();
          const dataUrl = await blobToDataUrl(blob);
          dataURLCache.set(url, dataUrl);
          img.src = dataUrl;
        } catch {
          /* 個別失敗は無視 */
        }
      })(),
    );
  }

  if (fetchTasks.length > 0) {
    await Promise.allSettled(fetchTasks);
  }

  // 全 img のデコード完了を待ち、レンダリングが間に合わない初回問題を防ぐ
  await Promise.allSettled(images.map((img) => waitForImageDecode(img)));
}

/** 2 フレーム待ってブラウザのレイアウト/スタイル反映を待つ */
function waitForLayoutSettle(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * 元 DOM を変更しないため、画面外（ただし WebKit でも painting が走る位置）に
 * 「ステージ」を作ってクローンを配置して撮影する。
 *
 * 注意点:
 *  - `left: -100000px` のような極端な位置だと WebKit/WKWebView 環境で painting が遅延し、
 *    初回キャプチャ時に portrait が空のまま直列化される（= 共有画像で抜ける）ことがある。
 *  - そのため画面内に置きつつ `transform: translate(...)` で画面外に押し出し、合成レイヤーを
 *    強制して painting を確実に走らせる。
 */
function createOffscreenStage(): HTMLDivElement {
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.setAttribute("data-share-capture-stage", "true");
  stage.style.cssText = [
    "position: fixed",
    "left: 0",
    "top: 0",
    `width: ${CAPTURE_STAGE_WIDTH_PX}px`,
    `min-width: ${CAPTURE_STAGE_WIDTH_PX}px`,
    `max-width: ${CAPTURE_STAGE_WIDTH_PX}px`,
    "padding: 0",
    "margin: 0",
    "background: transparent",
    "pointer-events: none",
    "z-index: -1",
    /* GPU 合成レイヤーを強制し、画面外でも painting が走るようにする */
    "transform: translate3d(-100vw, 0, 0)",
    "will-change: transform",
    /* 親フローへ影響しない */
    "contain: layout paint",
  ].join(";");
  return stage;
}

/**
 * 測定結果カード領域を PNG にして共有（navigator.share の files）→失敗時はダウンロード。
 * ユーザーが共有シートをキャンセルした場合はダウンロードしない。
 */
export async function shareResultCapture(
  element: HTMLElement,
): Promise<ShareResultOutcome> {
  const stage = createOffscreenStage();
  const clone = element.cloneNode(true) as HTMLElement;

  // 共有用スタイルを有効化し、不要な動的状態クラスは取り除く
  clone.classList.add(SHARE_CAPTURE_CLASS);
  clone.classList.remove("is-entering", "is-tapped");

  // 元 element に残っていたチルト用の inline transform をリセット（共有時は不要）
  clone.style.removeProperty("transform");

  stage.appendChild(clone);
  document.body.appendChild(stage);

  let blob: Blob | null = null;
  try {
    // ステージ挿入直後はレイアウトが未確定の場合があるため、確実に反映を待つ
    await waitForLayoutSettle();
    await delay(PRE_INLINE_LAYOUT_DELAY_MS);

    try {
      await inlineImgSourcesForCapture(clone);
    } catch {
      /* インライン化全体が失敗してもキャプチャは試行 */
    }

    // 画像差し替え後、WebKit の painting cycle を確実に走らせるための強制ウェイト。
    // ここをケチると初回キャプチャで portrait が空になる事故が再発するため、
    // UI 側のローディング表示（is-busy）と引き換えに十分な余裕を取る。
    await waitForLayoutSettle();
    await delay(POST_INLINE_PAINT_DELAY_MS);
    await waitForLayoutSettle();

    const captureWidth = Math.max(
      CAPTURE_STAGE_WIDTH_PX,
      clone.offsetWidth,
    );
    const captureHeight = Math.max(1, clone.offsetHeight);
    const computedStyle = window.getComputedStyle(clone);
    blob = await toBlob(clone, {
      pixelRatio: 2,
      // Tauri 環境では cacheBust クエリでローカル画像が欠落することがあるため無効化
      cacheBust: false,
      backgroundColor: "#ffffff",
      width: captureWidth,
      height: captureHeight,
      style: {
        borderRadius: computedStyle.borderRadius,
        overflow: "hidden",
        border: "none",
        boxShadow: "none",
        outline: "none",
        animation: "none",
        transition: "none",
        transform: "none",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...( { useCORS: true } as any),
    });
  } finally {
    stage.remove();
  }

  if (!blob) {
    throw new Error("Capture failed");
  }

  const file = new File([blob], `pinn-result-${Date.now()}.png`, {
    type: "image/png",
  });

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    let canShareFiles = false;
    if (typeof navigator.canShare === "function") {
      try {
        canShareFiles = navigator.canShare({ files: [file] });
      } catch {
        canShareFiles = false;
      }
    } else {
      canShareFiles = true;
    }

    if (canShareFiles) {
      try {
        await navigator.share({
          title: "Piin",
          text: "Piinでピンアナゴを獲得しました！",
          files: [file],
        });
        return "shared";
      } catch (err) {
        if (isAbortError(err)) {
          return "aborted";
        }
        /* ファイル共有失敗 → テキストのみ試行しないでダウンロードへ */
      }
    } else {
      try {
        await navigator.share({
          title: "Piin",
          text: "Piinでピンアナゴを獲得しました！",
        });
        return "shared";
      } catch (err) {
        if (isAbortError(err)) {
          return "aborted";
        }
      }
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

/**
 * 共有用の portrait 等をアプリ起動時にプリロードしてキャッシュへ載せる。
 * 初回共有時の painting タイミング起因で portrait が抜ける問題を更に減らせる。
 */
export async function preloadShareImageCache(srcs: readonly string[]): Promise<void> {
  await Promise.all(
    srcs.map(async (srcAttr) => {
      if (!srcAttr || srcAttr.startsWith("data:")) {
        return;
      }
      const isHttp = /^https?:\/\//i.test(srcAttr);
      const isAppPath = srcAttr.startsWith("/");
      if (!isHttp && !isAppPath) {
        return;
      }
      const url = isHttp
        ? srcAttr
        : new URL(srcAttr, window.location.origin).href;
      if (dataURLCache.has(url)) {
        return;
      }
      try {
        const res = await fetch(url, {
          mode: "cors",
          credentials: "same-origin",
        });
        if (!res.ok) {
          return;
        }
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        dataURLCache.set(url, dataUrl);
      } catch {
        /* 失敗してもアプリ動作には影響しない */
      }
    }),
  );
}
