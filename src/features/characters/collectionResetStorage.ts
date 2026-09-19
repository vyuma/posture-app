/** Cumulative tombstones: an old delivery cannot restore a reset reward. */
export type CollectionReset = { sourceId: string; measurementIds: string[] };
const KEY = "posture.mobile.collection-reset.v1";
export function readCollectionReset(): CollectionReset | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value.sourceId || !Array.isArray(value.measurementIds) || !value.measurementIds.every((id: unknown) => typeof id === "string")) {
    throw new Error("コレクションのリセット記録を読み込めません。");
  }
  return value;
}
export function saveCollectionReset(reset: CollectionReset): void {
  localStorage.setItem(KEY, JSON.stringify(reset));
}
