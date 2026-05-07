export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

export function normalizeVector2D(vector: { x: number; y: number }) {
  const length = Math.hypot(vector.x, vector.y);
  if (!isFiniteNumber(length) || length < 1e-6) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}
