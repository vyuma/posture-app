import confetti from "canvas-confetti";

/** デフォルト（キャラ未取得などのフォールバック） */
const DEFAULT_ACQUISITION_COLORS = [
  "#fd8c3e",
  "#ffb347",
  "#13a2d7",
  "#7dd4f5",
  "#f2edcc",
  "#ffffff",
];

export type AcquisitionConfettiOptions = {
  /** 獲得したキャラのトーンと合わせる */
  characterColors?: { primary: string; soft: string };
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHexColor(color: string): string | null {
  const hex = color.trim().replace(/^#/, "");
  if (/^[\da-fA-F]{6}$/.test(hex)) {
    return hex.toLowerCase();
  }
  if (/^[\da-fA-F]{3}$/.test(hex)) {
    return hex
      .split("")
      .map((c) => `${c}${c}`)
      .join("")
      .toLowerCase();
  }
  return null;
}

/** HEXカラーを指定率だけ明るく/暗くする（+で明るく、-で暗く） */
function shiftHexLightness(color: string, deltaRate: number): string {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return color;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const delta = 255 * deltaRate;
  const nextR = clampByte(r + delta);
  const nextG = clampByte(g + delta);
  const nextB = clampByte(b + delta);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(nextR)}${toHex(nextG)}${toHex(nextB)}`;
}

/**
 * 測定でキャラを獲得したときのアニメーション（Web 版：canvas-confetti）
 * prefers-reduced-motion では実行しない。
 */
export function playAcquisitionConfetti(
  options?: AcquisitionConfettiOptions,
): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const colors =
    options?.characterColors !== undefined
      ? (() => {
          // 毎回わずかに違うトーンを混ぜ、同じキャラでも単調に見えないようにする
          const brightenRate = 0.08 + Math.random() * 0.08;
          const darkenRate = -(0.08 + Math.random() * 0.08);
          const primary = options.characterColors.primary;
          const soft = options.characterColors.soft;
          return [
            primary,
            soft,
            shiftHexLightness(primary, brightenRate),
            shiftHexLightness(primary, darkenRate),
            "#ffffff",
            "#f2edcc",
          ];
        })()
      : DEFAULT_ACQUISITION_COLORS;

  const base = {
    ticks: 200,
    gravity: 0.9,
    decay: 0.92,
    colors,
    disableForReducedMotion: true,
  };

  /** 画面左右からキャノン射出 */
  const fireSides = () => {
    confetti({
      ...base,
      particleCount: 72,
      spread: 62,
      startVelocity: 48,
      origin: { x: 0.08, y: 0.75 },
      angle: 60,
    });
    confetti({
      ...base,
      particleCount: 72,
      spread: 62,
      startVelocity: 48,
      origin: { x: 0.92, y: 0.75 },
      angle: 120,
    });
  };

  /** 画面上部センターからシャワー */
  const shower = () => {
    confetti({
      ...base,
      particleCount: 90,
      spread: 105,
      startVelocity: 32,
      origin: { x: 0.5, y: 0.35 },
      scalar: 0.92,
    });
  };

  fireSides();
  shower();

  window.setTimeout(() => {
    confetti({
      ...base,
      particleCount: 55,
      spread: 80,
      startVelocity: 28,
      origin: { x: 0.5, y: 0.62 },
      angle: 90,
    });
  }, 260);

  window.setTimeout(() => {
    fireSides();
  }, 520);
}
