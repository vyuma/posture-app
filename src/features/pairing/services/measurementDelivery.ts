import type { MeasurementResult } from "../../flow/types";
import type { AcquiredCharacterEventInput } from "./desktopBridge";
import { invoke } from "@tauri-apps/api/core";

export type CompletedMeasurement = MeasurementResult & {
  sourceId: string;
  character?: AcquiredCharacterEventInput;
};
const KEY = "posture.mobile.measurement-journal.v1";
const SOURCE_KEY = "posture.mobile.source-id.v1";
const pendingSaves = new Map<string, CompletedMeasurement>();
let cachedSourceId: string | null = null;

export function saveCompletedMeasurement(result: MeasurementResult, character?: AcquiredCharacterEventInput): CompletedMeasurement {
  const sourceId = cachedSourceId ?? localStorage.getItem(SOURCE_KEY) ?? crypto.randomUUID();
  cachedSourceId = sourceId;
  const entry = { ...result, sourceId, character };
  pendingSaves.set(entry.id, entry);
  readCompletedMeasurements(); // Flushes synchronously; failures stay in memory for retry.
  return entry;
}
export function readCompletedMeasurements(): CompletedMeasurement[] {
  const journal = JSON.parse(localStorage.getItem(KEY) || "[]");
  if (!Array.isArray(journal)) throw new Error("測定結果の保存データを読み込めません。");
  if (pendingSaves.size) {
    const merged = [...journal.filter((item: CompletedMeasurement) => !pendingSaves.has(item.id)), ...pendingSaves.values()];
    if (cachedSourceId) localStorage.setItem(SOURCE_KEY, cachedSourceId);
    localStorage.setItem(KEY, JSON.stringify(merged));
    pendingSaves.clear();
    return merged;
  }
  return journal;
}

// The local journal remains after native acceptance/ACK, so a PC restart can replay it.
// Retries do not wait for the phone; native code handles delivery ACKs.
export async function publishCompletedMeasurement(result: CompletedMeasurement): Promise<void> {
  await invoke("emit_completed_measurement", { result });
}
