import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

import {
  DEPTH_INPUT_HEIGHT,
  DEPTH_PROBE_BASELINE_MS,
  DEPTH_PROBE_INTERVAL_MS,
} from "../constants";
import { buildDepthProbePoints, getDepthInputSize } from "./depthProbe.math";
import {
  DEPTH_PROBE_OFF,
  type DepthProbeSnapshot,
  type DepthWorkerRequest,
  type DepthWorkerResponse,
} from "./depthProbe.types";

const BASELINE_MIN_SAMPLES = 5;

/** `?depth=1` または `VITE_ENABLE_DEPTH_PROBE=true` のときだけ深度モデルを読み込む。 */
export function isDepthProbeEnabled() {
  if (import.meta.env.VITE_ENABLE_DEPTH_PROBE === "true") {
    return true;
  }
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("depth");
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 深度ワーカーの所有者。推論中のフレームは送らず、一定間隔で最新フレームだけを投げる。
 * 開始から DEPTH_PROBE_BASELINE_MS の間の値を基準姿勢として持つ。
 */
export class DepthProbeClient {
  private worker: Worker;
  private ready = false;
  private inFlight = false;
  private lastSubmitAt = 0;
  private nextId = 0;
  private baselineStartedAt: number | null = null;
  private baselineSamples: number[] = [];
  private baseline: number | null = null;
  private snapshot: DepthProbeSnapshot = { ...DEPTH_PROBE_OFF, status: "loading" };

  constructor(private readonly onUpdate: (snapshot: DepthProbeSnapshot) => void) {
    this.worker = new Worker(new URL("./depth.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<DepthWorkerResponse>) => this.handle(event.data);
    this.worker.onerror = (event) => {
      this.inFlight = false;
      this.update({ status: "error", message: event.message || "深度ワーカーでエラーが発生しました。" });
    };
    this.post({ type: "init" });
    this.onUpdate(this.snapshot);
  }

  /** 毎フレーム呼んでよい。間隔・推論中・ランドマーク不足のときは何もしない。 */
  submit(video: HTMLVideoElement, landmarks: NormalizedLandmark[] | null, now: number) {
    if (!this.ready || this.inFlight || now - this.lastSubmitAt < DEPTH_PROBE_INTERVAL_MS) {
      return;
    }

    const probes = buildDepthProbePoints(landmarks, video.videoWidth, video.videoHeight);
    if (!probes) {
      return;
    }

    this.inFlight = true;
    this.lastSubmitAt = now;
    const { width, height } = getDepthInputSize(video.videoWidth, video.videoHeight, DEPTH_INPUT_HEIGHT);
    createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: "medium" })
      .then((bitmap) => {
        this.post({ type: "estimate", id: this.nextId++, bitmap, probes }, [bitmap]);
      })
      .catch(() => {
        this.inFlight = false;
      });
  }

  resetBaseline() {
    this.baselineStartedAt = null;
    this.baselineSamples = [];
    this.baseline = null;
    this.update({ deltaFromBaseline: null, baselineReady: false });
  }

  dispose() {
    this.worker.terminate();
  }

  private post(message: DepthWorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }

  private handle(message: DepthWorkerResponse) {
    if (message.type === "ready") {
      this.ready = true;
      this.update({
        status: "ready",
        backend: message.backend,
        model: message.model,
        message: `読み込み ${Math.round(message.loadMs)}ms`,
      });
      return;
    }

    if (message.type === "error") {
      this.inFlight = false;
      this.update(
        message.id === undefined
          ? { status: "error", message: message.message }
          : { message: message.message },
      );
      return;
    }

    this.inFlight = false;
    const { earDisparity, shoulderDisparity, frameRange, inferenceMs } = message;
    const delta =
      earDisparity !== null && shoulderDisparity !== null ? earDisparity - shoulderDisparity : null;
    const normalized = delta !== null && frameRange > 0 ? delta / frameRange : null;

    this.update({
      inferenceMs,
      earShoulderDelta: delta,
      normalizedDelta: normalized,
      deltaFromBaseline:
        normalized !== null ? this.trackBaseline(normalized, performance.now()) : null,
      baselineReady: this.baseline !== null,
      message: null,
    });
  }

  private trackBaseline(value: number, now: number) {
    if (this.baseline !== null) {
      return value - this.baseline;
    }

    this.baselineStartedAt ??= now;
    this.baselineSamples.push(value);
    if (
      now - this.baselineStartedAt >= DEPTH_PROBE_BASELINE_MS &&
      this.baselineSamples.length >= BASELINE_MIN_SAMPLES
    ) {
      this.baseline = median(this.baselineSamples);
      return value - this.baseline;
    }
    return null;
  }

  private update(patch: Partial<DepthProbeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onUpdate(this.snapshot);
  }
}
