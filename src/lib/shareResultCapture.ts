import { toBlob } from "html-to-image";

import { deliverResultImage, type ShareResultAction, type ShareResultOutcome } from "./resultImageDelivery";
export type { ShareResultAction, ShareResultOutcome } from "./resultImageDelivery";

const SHARE_CAPTURE_CLASS = "is-share-capture";
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
    if (img.complete) {
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
function createOffscreenStage(width: number): HTMLDivElement {
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.setAttribute("data-share-capture-stage", "true");
  stage.style.cssText = [
    "position: fixed",
    "left: 0",
    "top: 0",
    `width: ${width}px`,
    `min-width: ${width}px`,
    `max-width: ${width}px`,
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

/** Capture only the card; preserve its opaque surface and transparent corners. */
async function captureResultCard(element: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  await Promise.all(Array.from(element.querySelectorAll("img"), waitForImageDecode));
  const captureWidth = element.offsetWidth;
  let captureHeight = element.offsetHeight;
  const stage = createOffscreenStage(captureWidth);
  const clone = element.cloneNode(true) as HTMLElement;

  // Resolve styles while the source still has its screen/dialog ancestors.
  // Moving the clone first loses inherited colors, portrait geometry and media layout.
  const sourceNodes = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  sourceNodes.forEach((source, index) => {
    const target = cloneNodes[index];
    const computed = getComputedStyle(source);
    for (const property of Array.from(computed)) {
      target.style.setProperty(property, computed.getPropertyValue(property));
    }
    target.style.animation = "none";
    target.style.transition = "none";
  });
  clone.querySelectorAll("[data-export-exclude]").forEach(node => node.remove());
  if (element.dataset.rarityEffect) {
    clone.style.opacity = "1";
    const art = clone.querySelector<HTMLElement>(".work-detail-art");
    if (art) art.style.boxShadow = "none";
  }
  // Capture the exact original portrait, never a half-open eye or an unwrapping frame.
  clone.querySelectorAll<HTMLElement>("[data-rarity-export-portrait]").forEach(image => { image.style.visibility = "visible"; });
  clone.querySelectorAll<HTMLElement>(".rarity-backdrop, .character-stars>svg").forEach(node => {
    node.style.transform = "none";
    node.style.opacity = "1";
  });
  // Collection viewing has a lighter, repositioned date. Export keeps the acquisition styling.
  if (element.dataset.variant === "collection") {
    const date = clone.querySelector<HTMLElement>(".work-detail-body>time");
    if (date) { date.style.marginLeft = "0"; date.style.marginRight = `${captureWidth * .0166436}px`; date.style.width = "auto"; date.style.textAlign = "right"; date.style.top = "0"; date.style.color = "#505050"; date.style.setProperty("-webkit-text-fill-color", "#505050"); }
    const focusLabel = clone.querySelector<HTMLElement>(".work-result-metrics>div:first-child>span");
    if (focusLabel) focusLabel.style.textAlign = "center";
    clone.dataset.variant = "result";
    // On narrow screens the entry occupies a flex row. Let the clone collapse
    // that row after removal so its saved PNG has the acquisition card's height.
    if (getComputedStyle(element).display === "flex") {
      clone.style.height = "auto";
      const metrics = clone.querySelector<HTMLElement>(".work-result-metrics");
      if (metrics) metrics.style.justifyContent = "space-around";
      const body = clone.querySelector<HTMLElement>(".work-detail-body");
      if (body) body.style.height = "auto";
      if (date) { date.style.marginRight = "0"; date.style.marginLeft = "0"; }
    }
  }
  clone.classList.add(SHARE_CAPTURE_CLASS);
  clone.classList.remove("is-entering", "is-tapped");
  clone.style.transform = "none";
  clone.style.margin = "0";

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

    captureHeight = clone.offsetHeight;
    const computedStyle = window.getComputedStyle(clone);
    blob = await toBlob(clone, {
      pixelRatio: 2,
      // Tauri 環境では cacheBust クエリでローカル画像が欠落することがあるため無効化
      cacheBust: false,
      // Do not set backgroundColor: it paints the full rectangular canvas and
      // overrides the node background. Keep the clone's rounded white surface.
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

  return blob;
}

export function shareResultCapture(
  element: HTMLElement,
  options: { action?: ShareResultAction } = {},
): Promise<ShareResultOutcome> {
  return deliverResultImage(captureResultCard(element), options.action);
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
