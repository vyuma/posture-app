type WarmupCountdownVeilProps = {
  remainingMs: number;
  totalMs: number;
  /** 省略時は測定ウォームアップ用の文言 */
  label?: string;
  /** 姿勢登録画面：Figma 320px 円・20px ストローク・数字 128px（直径の 40%）に合わせる */
  variant?: "default" | "register";
};

export function WarmupCountdownVeil({
  remainingMs,
  totalMs,
  label = "基準姿勢を測定中…",
  variant = "default",
}: WarmupCountdownVeilProps) {
  const safeTotal = Math.max(1, totalMs);
  const clampedRemaining = Math.max(0, Math.min(safeTotal, remainingMs));
  const progress = 1 - clampedRemaining / safeTotal;
  const seconds = Math.max(1, Math.ceil(clampedRemaining / 1000));
  const isRegister = variant === "register";
  const radius = isRegister ? 150 : 46;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const cx = isRegister ? 160 : 50;
  const cy = isRegister ? 160 : 50;
  const viewBox = isRegister ? "0 0 320 320" : "0 0 100 100";
  const rotate = isRegister ? "rotate(-90 160 160)" : "rotate(-90 50 50)";

  const rootClass = ["warmup-veil", isRegister ? "warmup-veil--register" : ""]
    .filter(Boolean)
    .join(" ");
  const innerClass = [
    "warmup-veil-inner",
    isRegister ? "warmup-veil-inner--register" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ringBlock = (
    <div className={innerClass}>
      <svg
        className="warmup-veil-ring"
        viewBox={viewBox}
        aria-hidden="true"
      >
        <circle
          className="warmup-veil-ring-track"
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
        />
        <circle
          className="warmup-veil-ring-progress"
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={rotate}
        />
      </svg>
      <div className="warmup-veil-count" aria-hidden="true">
        {seconds}
      </div>
    </div>
  );

  return (
    <div className={rootClass} role="status" aria-live="polite">
      {isRegister ? (
        <div className="warmup-veil-register-stack">
          {ringBlock}
          <p className="warmup-veil-label">{label}</p>
        </div>
      ) : (
        <>
          {ringBlock}
          <p className="warmup-veil-label">{label}</p>
        </>
      )}
    </div>
  );
}
