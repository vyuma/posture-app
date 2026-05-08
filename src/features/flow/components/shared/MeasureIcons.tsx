export function MeasurePauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true">
      <rect x="6" y="5" width="5" height="14" rx="1" fill="currentColor" />
      <rect x="13" y="5" width="5" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

export function MeasurePlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true">
      <path fill="#16a34a" d="M9 6.5v11l10-5.5-10-5.5z" />
    </svg>
  );
}

export function MeasureStopIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="1.5"
        fill="currentColor"
      />
    </svg>
  );
}
