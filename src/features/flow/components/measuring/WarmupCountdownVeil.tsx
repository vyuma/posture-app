type WarmupCountdownVeilProps = {
  remainingMs: number;
  totalMs: number;
  /** 省略時は測定ウォームアップ用の文言 */
  label?: string;
};

export function WarmupCountdownVeil({
  remainingMs,
  totalMs,
  label = "基準姿勢を測定中…",
}: WarmupCountdownVeilProps) {
  const safeTotal = Math.max(1, totalMs);
  const clampedRemaining = Math.max(0, Math.min(safeTotal, remainingMs));
  const progress = 1 - clampedRemaining / safeTotal;
  const seconds = Math.max(1, Math.ceil(clampedRemaining / 1000));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="warmup-veil" role="status" aria-live="polite">
      <div className="warmup-veil-inner">
        <svg
          className="warmup-veil-ring"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            className="warmup-veil-ring-track"
            cx="50"
            cy="50"
            r={radius}
            fill="none"
          />
          <circle
            className="warmup-veil-ring-progress"
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="warmup-veil-count" aria-hidden="true">
          {seconds}
        </div>
      </div>
      <p className="warmup-veil-label">{label}</p>
    </div>
  );
}
