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

const CHARACTER_OVERLAY_STORAGE_KEY = "posture.overlay.characterVisible.v1";
const OVERLAY_OFFSET_STORAGE_KEY = "posture.overlay.positionOffset.v1";
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
