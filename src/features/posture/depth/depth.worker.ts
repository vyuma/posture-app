import * as ort from "onnxruntime-web/webgpu";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

import { DEPTH_MODEL_BASE_URL } from "../constants";
import { depthRange, rgbaToPixelValues, sampleGroup } from "./depthProbe.math";
import type {
  DepthBackend,
  DepthWorkerRequest,
  DepthWorkerResponse,
} from "./depthProbe.types";

// tsconfig の lib に WebWorker を入れると DOM と衝突するため、使う分だけ型を書く。
const workerScope = self as unknown as {
  postMessage(message: DepthWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<DepthWorkerRequest>) => void) | null;
};

type GpuNavigator = {
  gpu?: { requestAdapter(): Promise<{ features: { has(name: string): boolean } } | null> };
};

const MODEL_CACHE_NAME = "posture-depth-models-v1";

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
// COOP/COEP がないと SharedArrayBuffer が使えずスレッド化できない。
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let session: ort.InferenceSession | null = null;
let canvas: OffscreenCanvas | null = null;

async function pickBackend(): Promise<{ backend: DepthBackend; model: string }> {
  const adapter = await (navigator as GpuNavigator).gpu?.requestAdapter().catch(() => null);
  if (adapter) {
    // fp16 モデルは shader-f16 が必要。なければ fp32 に落とす。
    return {
      backend: "webgpu",
      model: adapter.features.has("shader-f16") ? "model_fp16.onnx" : "model.onnx",
    };
  }
  return { backend: "wasm", model: "model_quantized.onnx" };
}

/** モデルは数十MBあるので Cache Storage に置き、2回目以降はダウンロードしない。 */
async function fetchModel(url: string) {
  const cache = await caches.open(MODEL_CACHE_NAME).catch(() => null);
  const cached = await cache?.match(url);
  if (cached) {
    return cached.arrayBuffer();
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`モデルの取得に失敗しました (${response.status})`);
  }
  await cache?.put(url, response.clone()).catch(() => undefined);
  return response.arrayBuffer();
}

async function init() {
  const startedAt = performance.now();
  const { backend, model } = await pickBackend();
  const modelBuffer = await fetchModel(`${DEPTH_MODEL_BASE_URL}/${model}`);

  try {
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: [backend],
      graphOptimizationLevel: "all",
    });
    return { backend, model, loadMs: performance.now() - startedAt };
  } catch (error) {
    if (backend === "wasm") {
      throw error;
    }
    // WebGPU で作れなかった環境は WASM の量子化モデルで続ける。
    const fallbackModel = "model_quantized.onnx";
    session = await ort.InferenceSession.create(
      await fetchModel(`${DEPTH_MODEL_BASE_URL}/${fallbackModel}`),
      { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
    );
    return {
      backend: "wasm" as const,
      model: fallbackModel,
      loadMs: performance.now() - startedAt,
    };
  }
}

async function estimate(request: Extract<DepthWorkerRequest, { type: "estimate" }>) {
  if (!session) {
    throw new Error("深度モデルが初期化されていません。");
  }

  // 縮小はメインスレッドの createImageBitmap で済ませてあり、ここでは画素を取り出すだけ。
  const { bitmap, probes, id, includeDepthMap } = request;
  const { width, height } = bitmap;
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("OffscreenCanvas の 2D コンテキストを取得できません。");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);

  const startedAt = performance.now();
  const input = new ort.Tensor("float32", rgbaToPixelValues(data, width, height), [1, 3, height, width]);
  const outputs = await session.run({ [session.inputNames[0]]: input });
  const output = outputs[session.outputNames[0]];
  const depth = output.data as Float32Array;
  const inferenceMs = performance.now() - startedAt;

  const [outHeight, outWidth] = output.dims.slice(-2);
  const response: DepthWorkerResponse = {
    type: "result",
    id,
    earDisparity: sampleGroup(depth, outWidth, outHeight, probes.ear, probes.radiusPx, probes.imageWidth),
    shoulderDisparity: sampleGroup(depth, outWidth, outHeight, probes.shoulder, probes.radiusPx, probes.imageWidth),
    frameRange: depthRange(depth),
    inferenceMs,
    // 出力バッファは dispose で解放されるので、渡すときは複製する。
    depthMap: includeDepthMap
      ? { data: depth.slice(), width: outWidth, height: outHeight }
      : undefined,
  };
  input.dispose();
  output.dispose();
  return response;
}

const transferablesOf = (response: DepthWorkerResponse): Transferable[] =>
  response.type === "result" && response.depthMap ? [response.depthMap.data.buffer] : [];

const toMessage = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type === "init") {
    init()
      .then((ready) => workerScope.postMessage({ type: "ready", ...ready }))
      .catch((error) => workerScope.postMessage({ type: "error", message: toMessage(error) }));
    return;
  }

  estimate(request)
    .then((result) => workerScope.postMessage(result, transferablesOf(result)))
    .catch((error) => {
      request.bitmap.close();
      workerScope.postMessage({ type: "error", id: request.id, message: toMessage(error) });
    });
};
