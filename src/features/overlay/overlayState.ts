export type OverlayMode = "hidden" | "good" | "bad" | "paused";

export type OverlayStatePayload = {
  mode: OverlayMode;
  userHidden: boolean;
  offsetX: number;
  offsetY: number;
};

export type PositionOffset = {
  x: number;
  y: number;
};

export const DEFAULT_OVERLAY_STATE: OverlayStatePayload = {
  mode: "hidden",
  userHidden: false,
  offsetX: 0,
  offsetY: 0,
};

/** 開発・QA 向けUI（measuring と overlay が参照）。本番でも localStorage で有効化可。 */
export const OVERLAY_DEBUG_UI_STORAGE_KEY = "posture.debug.overlay";

/** `VITE_SHOW_DEBUG_UI=true` で本番・Tauri パッケージにもデバッグUIを出す */
export function isDebugUiBuildEnabled(): boolean {
  return (
    import.meta.env.DEV || import.meta.env.VITE_SHOW_DEBUG_UI === "true"
  );
}

export function isOverlayDebugUiEnabled(): boolean {
  if (isDebugUiBuildEnabled()) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(OVERLAY_DEBUG_UI_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const CHARACTER_OVERLAY_STORAGE_KEY = "posture.overlay.characterVisible.v1";
const OVERLAY_OFFSET_STORAGE_KEY = "posture.overlay.positionOffset.v1";
/** キャラクター配置ヘルプ吹き出しを「初回ドラッグ完了」で消すためのキー */
const OVERLAY_PLACEMENT_HINT_DISMISSED_KEY =
  "posture.overlay.placementHint.dismissed.v1";
const OFFSET_LIMIT_PX = 520;
const DEFAULT_POSITION_OFFSET: PositionOffset = { x: 0, y: 0 };

export function loadCharacterOverlayEnabled() {
  try {
    return window.localStorage.getItem(CHARACTER_OVERLAY_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveCharacterOverlayEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(
      CHARACTER_OVERLAY_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

export function loadStoredPositionOffset(): PositionOffset {
  try {
    const raw = window.localStorage.getItem(OVERLAY_OFFSET_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_POSITION_OFFSET;
    }

    const parsed = JSON.parse(raw) as Partial<PositionOffset>;
    return clampPositionOffset({
      x: typeof parsed.x === "number" ? parsed.x : 0,
      y: typeof parsed.y === "number" ? parsed.y : 0,
    });
  } catch {
    return DEFAULT_POSITION_OFFSET;
  }
}

export function storePositionOffset(offset: PositionOffset) {
  try {
    window.localStorage.setItem(
      OVERLAY_OFFSET_STORAGE_KEY,
      JSON.stringify(clampPositionOffset(offset)),
    );
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

export function clearStoredPositionOffset() {
  try {
    window.localStorage.removeItem(OVERLAY_OFFSET_STORAGE_KEY);
  } catch {
    // Ignore storage failures in browser preview.
  }
}

/** 配置ヒント吹き出しを既に閉じたか（既定: 未閉鎖 = 表示する） */
export function loadPlacementHintDismissed(): boolean {
  try {
    return (
      window.localStorage.getItem(OVERLAY_PLACEMENT_HINT_DISMISSED_KEY) === "true"
    );
  } catch {
    return false;
  }
}

export function savePlacementHintDismissed() {
  try {
    window.localStorage.setItem(OVERLAY_PLACEMENT_HINT_DISMISSED_KEY, "true");
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

/** デバッグなどでヒント吹き出しを再度出すために永続フラグを消す */
export function clearPlacementHintDismissed() {
  try {
    window.localStorage.removeItem(OVERLAY_PLACEMENT_HINT_DISMISSED_KEY);
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

export function clampPositionOffset(offset: PositionOffset): PositionOffset {
  return {
    x: clampOffsetValue(offset.x),
    y: clampOffsetValue(offset.y),
  };
}

function clampOffsetValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-OFFSET_LIMIT_PX, Math.min(OFFSET_LIMIT_PX, Math.round(value)));
}
