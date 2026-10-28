export type ProbePoint = { x: number; y: number };

/** 深度を読む位置。座標は映像全体に対する正規化座標、半径は元映像の画素単位。 */
export type DepthProbePoints = {
  ear: ProbePoint[];
  shoulder: ProbePoint[];
  radiusPx: number;
  imageWidth: number;
};

export type DepthBackend = "webgpu" | "wasm";

export type DepthWorkerRequest =
  | { type: "init" }
  | {
      type: "estimate";
      id: number;
      bitmap: ImageBitmap;
      probes: DepthProbePoints;
    };

export type DepthWorkerResponse =
  | { type: "ready"; backend: DepthBackend; model: string; loadMs: number }
  | {
      type: "result";
      id: number;
      /** Depth Anything の出力は相対的な視差。大きいほどカメラに近い。 */
      earDisparity: number | null;
      shoulderDisparity: number | null;
      frameRange: number;
      inferenceMs: number;
    }
  | { type: "error"; id?: number; message: string };

export type DepthProbeStatus = "off" | "loading" | "ready" | "error";

export type DepthProbeSnapshot = {
  status: DepthProbeStatus;
  backend: DepthBackend | null;
  model: string | null;
  message: string | null;
  inferenceMs: number | null;
  /** 耳の視差 − 肩の視差。正なら頭が肩より手前。 */
  earShoulderDelta: number | null;
  /** earShoulderDelta をフレームの深度レンジで割った値。 */
  normalizedDelta: number | null;
  /** 基準姿勢の normalizedDelta からの変化。正なら頭が前に出ている。 */
  deltaFromBaseline: number | null;
  baselineReady: boolean;
};

export const DEPTH_PROBE_OFF: DepthProbeSnapshot = {
  status: "off",
  backend: null,
  model: null,
  message: null,
  inferenceMs: null,
  earShoulderDelta: null,
  normalizedDelta: null,
  deltaFromBaseline: null,
  baselineReady: false,
};
