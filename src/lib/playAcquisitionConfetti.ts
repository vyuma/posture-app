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
      ? [
          options.characterColors.primary,
          options.characterColors.soft,
          "#ffffff",
          "#f2edcc",
          "#b8c5ce",
        ]
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
