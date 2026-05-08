export function formatCollectionNumber(number: number) {
  return String(number).padStart(3, "0");
}

export function formatAcquiredAt(acquiredAt: string) {
  const acquiredDate = new Date(acquiredAt);

  if (Number.isNaN(acquiredDate.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(acquiredDate);
}

export function formatOptionalDuration(durationMs: number | undefined) {
  return typeof durationMs === "number" && Number.isFinite(durationMs)
    ? formatDuration(durationMs)
    : "-";
}

export function formatOptionalPercent(ratio: number | undefined) {
  return typeof ratio === "number" && Number.isFinite(ratio)
    ? formatPercent(ratio)
    : "-";
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPercent(ratio: number) {
  if (!Number.isFinite(ratio)) {
    return "0%";
  }

  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}
