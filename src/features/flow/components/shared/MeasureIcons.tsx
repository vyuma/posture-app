const CIRCLE_RED = "#EA4949";

export function MeasurePauseIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke={CIRCLE_RED}
        strokeWidth="3"
      />
      <rect x="23" y="22" width="6" height="20" rx="1.5" fill={CIRCLE_RED} />
      <rect x="35" y="22" width="6" height="20" rx="1.5" fill={CIRCLE_RED} />
    </svg>
  );
}

export function MeasurePlayIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke={CIRCLE_RED}
        strokeWidth="3"
      />
      <path fill={CIRCLE_RED} d="M28 20l16 12-16 12z" />
    </svg>
  );
}

export function MeasureStopIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke={CIRCLE_RED}
        strokeWidth="3"
      />
      <rect
        x="24"
        y="24"
        width="16"
        height="16"
        rx="2.5"
        fill={CIRCLE_RED}
      />
    </svg>
  );
}
