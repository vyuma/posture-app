import {
  FaceLandmarker,
  FilesetResolver,
  PoseLandmarker,
  type Matrix,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import {
  DEPTH_PROBE_BASELINE_MS,
  POSE_LANDMARK_INDEX,
  POSE_MODEL_URL,
  VISION_WASM_URL,
} from "../../src/features/posture/constants";
import {
  createPostureEngineState,
  evaluatePostureFrame,
} from "../../src/features/posture/engine";
import {
  buildDepthProbePoints,
  DEFAULT_DEPTH_PROBE_OPTIONS,
  getDepthInputSize,
  type DepthProbeOptions,
} from "../../src/features/posture/depth/depthProbe.math";
import type {
  DepthMap,
  DepthProbePoints,
  DepthWorkerRequest,
  DepthWorkerResponse,
  ProbePoint,
} from "../../src/features/posture/depth/depthProbe.types";
import { fitBackgroundAffine, personBox, type PersonBox } from "./alignment";
import { buildVerdict, type SignalKey, SIGNALS } from "./verdict";

const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type Label = "none" | "good" | "forward-head" | "slouch" | "turned" | "closer";

type PendingFrame = {
  id: number;
  probes: DepthProbePoints;
  landmarks: NormalizedLandmark[] | null;
  frame: ImageBitmap;
  inputWidth: number;
  inputHeight: number;
  mediapipeHeadForwardDeg: number | null;
  faceDistanceCm: number | null;
  shoulderWidthPx: number | null;
};

export type Sample = {
  t: number;
  label: Label;
  /** ラベル切り替え直後（姿勢の移行中）でない。判定にはこの行だけを使う。 */
  settled: boolean;
  earDisparity: number | null;
  shoulderDisparity: number | null;
  frameRange: number;
  /** 旧指標：(耳−肩)/フレームのレンジ の基準からの変化。 */
  oldMetric: number | null;
  /** 背景で基準フレームに合わせた後の、耳・肩・耳−肩の基準からの変化（基準フレームのレンジ比）。 */
  earChange: number | null;
  shoulderChange: number | null;
  neckChange: number | null;
  fitR2: number | null;
  fitScale: number | null;
  faceDistanceCm: number | null;
  /** 肩までの距離（肩幅から推定）に対して頭が何 cm 手前にあるかの、基準からの変化。 */
  faceForwardCm: number | null;
  mediapipeHeadForwardDeg: number | null;
  inferenceMs: number;
  inputWidth: number;
  inputHeight: number;
  options: DepthProbeOptions;
};

type Baseline = {
  startedAt: number | null;
  reference: DepthMap | null;
  referenceBox: PersonBox | null;
  referenceRange: number;
  samples: {
    oldNormalized: number[];
    alignedEar: number[];
    alignedShoulder: number[];
    faceDistanceCm: number[];
    shoulderWidthPx: number[];
  };
  ready: {
    oldNormalized: number;
    alignedEar: number;
    alignedShoulder: number;
    faceDistanceCm: number | null;
    shoulderWidthPx: number | null;
  } | null;
};

const SERIES_WINDOW_MS = 30_000;
const POSE_INTERVAL_MS = 33;
const SETTLE_MS = 1_000;
const LABEL_KEYS: Record<string, Label> = {
  "0": "none",
  "1": "good",
  "2": "forward-head",
  "3": "slouch",
  "4": "turned",
  "5": "closer",
};
const LABEL_TINT: Record<Label, string | null> = {
  none: null,
  good: "rgba(64, 192, 87, 0.14)",
  "forward-head": "rgba(250, 82, 82, 0.14)",
  slouch: "rgba(250, 176, 5, 0.16)",
  turned: "rgba(132, 94, 247, 0.14)",
  closer: "rgba(34, 139, 230, 0.14)",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const video = $<HTMLVideoElement>("video");
const statusEl = $<HTMLParagraphElement>("status");
const frameCanvas = $<HTMLCanvasElement>("frame");
const depthCanvas = $<HTMLCanvasElement>("depth");
const profileVCanvas = $<HTMLCanvasElement>("profile-v");
const profileHCanvas = $<HTMLCanvasElement>("profile-h");
const seriesDepthCanvas = $<HTMLCanvasElement>("series-depth");
const seriesCompareCanvas = $<HTMLCanvasElement>("series-compare");
const patchTable = $<HTMLTableElement>("patches");
const summaryList = $<HTMLDListElement>("summary");
const verdictTable = $<HTMLTableElement>("verdict-table");
const verdictText = $<HTMLDivElement>("verdict-text");
const inputHeightSelect = $<HTMLSelectElement>("input-height");
const intervalSelect = $<HTMLSelectElement>("interval");
const freezeButton = $<HTMLButtonElement>("freeze");
const recordButton = $<HTMLButtonElement>("record");
const downloadButton = $<HTMLButtonElement>("download");

const options: DepthProbeOptions = { ...DEFAULT_DEPTH_PROBE_OPTIONS };
const sliders: [string, keyof DepthProbeOptions][] = [
  ["ear-inward", "earInwardRatio"],
  ["shoulder-inward", "shoulderInwardRatio"],
  ["radius", "patchRadiusRatio"],
];

let poseLandmarker: PoseLandmarker | null = null;
let faceLandmarker: FaceLandmarker | null = null;
let engineState = createPostureEngineState();
let latestLandmarks: NormalizedLandmark[] | null = null;
let latestHeadForwardDeg: number | null = null;
let latestFaceDistanceCm: number | null = null;
let lastPoseAt = 0;
let lastDepthAt = 0;
let workerReady = false;
let backendLabel = "";
let pending: PendingFrame | null = null;
// createImageBitmap を待つ間に二重送信しないためのフラグ。結果かエラーで下ろす。
let requesting = false;
let nextId = 0;
let frozen = false;
let recording = false;
let label: Label = "none";
let labelChangedAt = 0;
let baseline = createBaseline();
const series: Sample[] = [];
const recorded: Sample[] = [];

const worker = new Worker(
  new URL("../../src/features/posture/depth/depth.worker.ts", import.meta.url),
  { type: "module" },
);

// ---- 計算 ----------------------------------------------------------------

function createBaseline(): Baseline {
  return {
    startedAt: null,
    reference: null,
    referenceBox: null,
    referenceRange: 1,
    samples: {
      oldNormalized: [],
      alignedEar: [],
      alignedShoulder: [],
      faceDistanceCm: [],
      shoulderWidthPx: [],
    },
    ready: null,
  };
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) {
    return NaN;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const median = (values: number[]) => quantile([...values].sort((a, b) => a - b), 0.5);
const medianOrNull = (values: number[]) => (values.length > 0 ? median(values) : null);

function toDepthPixel(point: ProbePoint, map: DepthMap) {
  return {
    x: Math.round(point.x * (map.width - 1)),
    y: Math.round(point.y * (map.height - 1)),
  };
}

function patchRadius(probes: DepthProbePoints, map: DepthMap) {
  return Math.max(1, Math.round((probes.radiusPx * map.width) / probes.imageWidth));
}

/** ワーカーの sampleDepthMedian と同じ窓の値をすべて取り出す。 */
function patchValues(map: DepthMap, point: ProbePoint, radius: number) {
  const { x: cx, y: cy } = toDepthPixel(point, map);
  const values: number[] = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(map.height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(map.width - 1, cx + radius); x += 1) {
      values.push(map.data[y * map.width + x]);
    }
  }
  return values.sort((a, b) => a - b);
}

function displayRange(map: DepthMap) {
  const sorted = Array.from(map.data.filter((_, i) => i % 5 === 0)).sort((a, b) => a - b);
  return { lo: quantile(sorted, 0.02), hi: quantile(sorted, 0.98) };
}

/** 顔の変換行列の平行移動成分から、カメラから頭までの距離（cm）を取り出す。 */
function faceDistanceFromMatrix(matrix: Matrix | undefined) {
  if (!matrix || matrix.data.length !== 16) {
    return null;
  }
  const d = matrix.data;
  // 最下行が (0,0,0,1) なら列優先で平行移動は 12〜14、そうでなければ行優先で 3,7,11。
  const columnMajor = Math.abs(d[3]) < 1e-6 && Math.abs(d[7]) < 1e-6 && Math.abs(d[11]) < 1e-6;
  const z = columnMajor ? d[14] : d[11];
  return Number.isFinite(z) ? Math.abs(z) : null;
}

function shoulderWidthPx(landmarks: NormalizedLandmark[] | null) {
  const left = landmarks?.[POSE_LANDMARK_INDEX.LEFT_SHOULDER];
  const right = landmarks?.[POSE_LANDMARK_INDEX.RIGHT_SHOULDER];
  if (!left || !right || (left.visibility ?? 0) < 0.5 || (right.visibility ?? 0) < 0.5) {
    return null;
  }
  return Math.hypot((left.x - right.x) * video.videoWidth, (left.y - right.y) * video.videoHeight);
}

function resetBaseline() {
  baseline = createBaseline();
  engineState = createPostureEngineState();
}

/**
 * 1フレーム分の指標を計算する。基準期間中は値を溜め、期間が終わったら中央値を基準にする。
 * 背景合わせは基準期間の最初のフレームを参照にする。
 */
function computeSignals(
  message: Extract<DepthWorkerResponse, { type: "result" }>,
  map: DepthMap,
  current: PendingFrame,
  now: number,
) {
  const { earDisparity: ear, shoulderDisparity: shoulder, frameRange } = message;
  const box = personBox(current.probes, map);
  if (!baseline.reference) {
    baseline.reference = map;
    baseline.referenceBox = box;
    baseline.referenceRange = frameRange || 1;
    baseline.startedAt = now;
  }

  const oldNormalized = ear !== null && shoulder !== null && frameRange > 0 ? (ear - shoulder) / frameRange : null;
  const fit = fitBackgroundAffine(map, baseline.reference, [box, baseline.referenceBox!]);
  const alignedEar = fit && ear !== null ? fit.a * ear + fit.b : null;
  const alignedShoulder = fit && shoulder !== null ? fit.a * shoulder + fit.b : null;

  if (!baseline.ready) {
    const s = baseline.samples;
    if (oldNormalized !== null) s.oldNormalized.push(oldNormalized);
    if (alignedEar !== null) s.alignedEar.push(alignedEar);
    if (alignedShoulder !== null) s.alignedShoulder.push(alignedShoulder);
    if (current.faceDistanceCm !== null) s.faceDistanceCm.push(current.faceDistanceCm);
    if (current.shoulderWidthPx !== null) s.shoulderWidthPx.push(current.shoulderWidthPx);
    if (
      now - baseline.startedAt! >= DEPTH_PROBE_BASELINE_MS &&
      s.oldNormalized.length >= 5 &&
      s.alignedEar.length >= 5
    ) {
      baseline.ready = {
        oldNormalized: median(s.oldNormalized),
        alignedEar: median(s.alignedEar),
        alignedShoulder: median(s.alignedShoulder),
        faceDistanceCm: medianOrNull(s.faceDistanceCm),
        shoulderWidthPx: medianOrNull(s.shoulderWidthPx),
      };
    }
  }

  const base = baseline.ready;
  const range = baseline.referenceRange;
  const earChange = base && alignedEar !== null ? (alignedEar - base.alignedEar) / range : null;
  const shoulderChange =
    base && alignedShoulder !== null ? (alignedShoulder - base.alignedShoulder) / range : null;
  // 肩までの距離は肩幅に反比例するとみなし、頭が肩よりどれだけ手前に出たかを cm で出す。
  const faceForwardCm =
    base?.faceDistanceCm != null &&
    base.shoulderWidthPx != null &&
    current.faceDistanceCm !== null &&
    current.shoulderWidthPx !== null
      ? base.faceDistanceCm * (base.shoulderWidthPx / current.shoulderWidthPx) - current.faceDistanceCm
      : null;

  return {
    oldMetric: base && oldNormalized !== null ? oldNormalized - base.oldNormalized : null,
    earChange,
    shoulderChange,
    neckChange: earChange !== null && shoulderChange !== null ? earChange - shoulderChange : null,
    fitR2: fit?.r2 ?? null,
    fitScale: fit?.a ?? null,
    faceForwardCm,
  };
}

/** Turbo カラーマップの多項式近似（Google, 2019）。t は 0〜1。 */
function turbo(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const r = 0.1357 + x * (4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5666 - x * 58.1375))));
  const g = 0.0914 + x * (2.1856 + x * (4.8052 - x * (14.0195 - x * (4.2109 + x * 2.7747))));
  const b = 0.1067 + x * (12.5925 - x * (60.1097 - x * (109.0745 - x * (88.5066 - x * 26.8183))));
  return [r * 255, g * 255, b * 255];
}

// ---- 描画 ----------------------------------------------------------------

function drawProbes(
  ctx: CanvasRenderingContext2D,
  probes: DepthProbePoints,
  width: number,
  height: number,
) {
  const radius = (probes.radiusPx * width) / probes.imageWidth;
  const groups: [ProbePoint[], string][] = [
    [probes.ear, css("--ear")],
    [probes.shoulder, css("--shoulder")],
  ];
  ctx.lineWidth = Math.max(1.5, width / 400);
  for (const [points, color] of groups) {
    ctx.strokeStyle = color;
    for (const point of points) {
      ctx.strokeRect(point.x * width - radius, point.y * height - radius, radius * 2, radius * 2);
    }
  }
}

function drawFrame(frame: ImageBitmap, probes: DepthProbePoints, landmarks: NormalizedLandmark[] | null) {
  frameCanvas.width = frame.width;
  frameCanvas.height = frame.height;
  const ctx = frameCanvas.getContext("2d")!;
  ctx.drawImage(frame, 0, 0);
  if (landmarks) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    for (const index of [0, 7, 8, 11, 12]) {
      const landmark = landmarks[index];
      if (landmark && (landmark.visibility ?? 0) >= 0.5) {
        ctx.beginPath();
        ctx.arc(landmark.x * frame.width, landmark.y * frame.height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  drawProbes(ctx, probes, frame.width, frame.height);
}

function drawDepth(
  map: DepthMap,
  probes: DepthProbePoints,
  lo: number,
  hi: number,
  neckX: number,
  shoulderY: number,
  box: PersonBox,
) {
  depthCanvas.width = map.width;
  depthCanvas.height = map.height;
  const ctx = depthCanvas.getContext("2d")!;
  const image = ctx.createImageData(map.width, map.height);
  const span = hi - lo || 1;
  for (let i = 0; i < map.data.length; i += 1) {
    const [r, g, b] = turbo((map.data[i] - lo) / span);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(neckX + 0.5, 0);
  ctx.lineTo(neckX + 0.5, map.height);
  ctx.moveTo(0, shoulderY + 0.5);
  ctx.lineTo(map.width, shoulderY + 0.5);
  ctx.stroke();
  // 背景合わせに使わない人物領域。
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, map.height - box.y0);
  ctx.setLineDash([]);
  drawProbes(ctx, probes, map.width, map.height);
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth || 400;
  const height = canvas.height;
  if (canvas.width !== width) {
    canvas.width = width;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "11px ui-monospace, Menlo, monospace";
  return { ctx, width, height };
}

/** 縦断面。縦軸が画像の y、横軸が視差（左ほど近い＝視差が大きい）。 */
function drawVerticalProfile(map: DepthMap, neckX: number, lo: number, hi: number, marks: [number, string, string][]) {
  const { ctx, width, height } = prepareCanvas(profileVCanvas);
  const pad = 28;
  const span = hi - lo || 1;
  const toX = (value: number) => pad + (1 - (value - lo) / span) * (width - pad * 2);
  const toY = (y: number) => (y / (map.height - 1)) * (height - 1);

  for (const [y, color, text] of marks) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, toY(y));
    ctx.lineTo(width, toY(y));
    ctx.stroke();
    ctx.fillText(text, 2, toY(y) - 3);
  }

  ctx.strokeStyle = css("--text");
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let y = 0; y < map.height; y += 1) {
    let sum = 0;
    let count = 0;
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = Math.min(map.width - 1, Math.max(0, neckX + dx));
      sum += map.data[y * map.width + x];
      count += 1;
    }
    const px = toX(sum / count);
    if (y === 0) ctx.moveTo(px, toY(y));
    else ctx.lineTo(px, toY(y));
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = css("--muted");
  ctx.fillText("近い", 2, height - 4);
  ctx.fillText("遠い", width - 28, height - 4);
}

/** 横断面。横軸が画像の x、縦軸が視差（上ほど近い）。 */
function drawHorizontalProfile(map: DepthMap, shoulderY: number, lo: number, hi: number, marks: [number, string][]) {
  const { ctx, width, height } = prepareCanvas(profileHCanvas);
  const pad = 16;
  const span = hi - lo || 1;
  const toX = (x: number) => (x / (map.width - 1)) * (width - 1);
  const toY = (value: number) => pad + (1 - (value - lo) / span) * (height - pad * 2);

  for (const [x, color] of marks) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(toX(x), 0);
    ctx.lineTo(toX(x), height);
    ctx.stroke();
  }

  ctx.strokeStyle = css("--text");
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x < map.width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const y = Math.min(map.height - 1, Math.max(0, shoulderY + dy));
      sum += map.data[y * map.width + x];
      count += 1;
    }
    const py = toY(sum / count);
    if (x === 0) ctx.moveTo(toX(x), py);
    else ctx.lineTo(toX(x), py);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = css("--muted");
  ctx.fillText("近い", 2, 12);
  ctx.fillText("遠い", 2, height - 4);
}

function renderPatchTable(map: DepthMap, probes: DepthProbePoints) {
  const radius = patchRadius(probes, map);
  const rows = [
    ...probes.ear.map((point, i) => [`耳 ${i + 1}`, point] as const),
    ...probes.shoulder.map((point, i) => [`肩 ${i + 1}`, point] as const),
  ];
  const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : "-");
  patchTable.innerHTML =
    "<tr><th>パッチ</th><th>p10</th><th>中央値</th><th>p90</th><th>幅</th><th>画素数</th></tr>" +
    rows
      .map(([name, point]) => {
        const values = patchValues(map, point, radius);
        const p10 = quantile(values, 0.1);
        const p90 = quantile(values, 0.9);
        return `<tr><td>${name}</td><td>${fmt(p10)}</td><td>${fmt(quantile(values, 0.5))}</td><td>${fmt(p90)}</td><td>${fmt(p90 - p10)}</td><td>${values.length}</td></tr>`;
      })
      .join("");
}

function renderSummary(sample: Sample) {
  const fmt = (value: number | null, digits = 3) => (value === null ? "-" : value.toFixed(digits));
  const learning = baseline.ready ? null : "基準を学習中";
  const items: [string, string][] = [
    ["耳の視差 / 肩の視差", `${fmt(sample.earDisparity)} / ${fmt(sample.shoulderDisparity)}`],
    ["旧指標（基準から）", learning ?? fmt(sample.oldMetric, 4)],
    ["耳の変化（背景合わせ）", learning ?? fmt(sample.earChange, 4)],
    ["肩の変化（背景合わせ）", learning ?? fmt(sample.shoulderChange, 4)],
    ["耳−肩の変化（背景合わせ）", learning ?? fmt(sample.neckChange, 4)],
    ["背景合わせ R² / 倍率", `${fmt(sample.fitR2, 2)} / ${fmt(sample.fitScale, 3)}`],
    ["Face 頭までの距離", sample.faceDistanceCm === null ? "顔なし" : `${sample.faceDistanceCm.toFixed(1)} cm`],
    ["Face 頭の前方移動", learning ?? (sample.faceForwardCm === null ? "-" : `${sample.faceForwardCm.toFixed(1)} cm`)],
    ["MediaPipe 頭部前傾角", fmt(sample.mediapipeHeadForwardDeg, 1)],
    ["入力 / 推論", `${sample.inputWidth}×${sample.inputHeight} / ${Math.round(sample.inferenceMs)}ms`],
  ];
  summaryList.innerHTML = items.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
}

type SeriesLine = {
  pick: (sample: Sample) => number | null;
  color: string;
  /** shared は同じグラフの shared 同士で縦軸を共有、own は線ごとに自動スケール。 */
  axis: "shared" | "own";
  minExtent: number;
  unit?: string;
};

function drawSeries(canvas: HTMLCanvasElement, lines: SeriesLine[], now: number) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const pad = 8;
  const start = now - SERIES_WINDOW_MS;
  const visible = series.filter((sample) => sample.t >= start);
  const toX = (t: number) => pad + ((t - start) / SERIES_WINDOW_MS) * (width - pad * 2);

  // ラベルの区間を背景に塗る。
  for (let i = 0; i < visible.length; i += 1) {
    const tint = LABEL_TINT[visible[i].label];
    if (!tint) continue;
    const x0 = toX(visible[i].t);
    const x1 = i + 1 < visible.length ? toX(visible[i + 1].t) : toX(now);
    ctx.fillStyle = tint;
    ctx.fillRect(x0, 0, x1 - x0, height);
  }

  const maxAbs = (line: SeriesLine) =>
    Math.max(
      line.minExtent,
      ...visible.map((s) => Math.abs(line.pick(s) ?? 0)),
    );
  const sharedExtent = Math.max(0, ...lines.filter((l) => l.axis === "shared").map(maxAbs));

  ctx.strokeStyle = css("--line");
  ctx.beginPath();
  ctx.moveTo(pad, height / 2);
  ctx.lineTo(width - pad, height / 2);
  ctx.stroke();

  lines.forEach((line, index) => {
    const extent = line.axis === "shared" ? sharedExtent : maxAbs(line);
    const toY = (value: number) => height / 2 - (value / extent) * (height / 2 - 14);
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let drawing = false;
    for (const sample of visible) {
      const value = line.pick(sample);
      if (value === null) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(toX(sample.t), toY(value));
      else ctx.moveTo(toX(sample.t), toY(value));
      drawing = true;
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    if (line.axis === "own" || index === 0) {
      ctx.fillStyle = line.axis === "own" ? line.color : css("--muted");
      const digits = extent < 0.01 ? 4 : extent < 1 ? 3 : 1;
      ctx.fillText(`±${extent.toFixed(digits)}${line.unit ?? ""}`, pad + index * 90, 11);
    }
  });
}

function drawAllSeries(now: number) {
  drawSeries(
    seriesDepthCanvas,
    [
      { pick: (s) => s.earChange, color: css("--ear"), axis: "shared", minExtent: 0.005 },
      { pick: (s) => s.shoulderChange, color: css("--shoulder"), axis: "shared", minExtent: 0.005 },
      { pick: (s) => s.neckChange, color: css("--baseline"), axis: "shared", minExtent: 0.005 },
      { pick: (s) => s.oldMetric, color: css("--normalized"), axis: "own", minExtent: 0.005 },
    ],
    now,
  );
  drawSeries(
    seriesCompareCanvas,
    [
      { pick: (s) => s.faceForwardCm, color: css("--face"), axis: "own", minExtent: 1, unit: "cm" },
      { pick: (s) => s.mediapipeHeadForwardDeg, color: css("--mediapipe"), axis: "own", minExtent: 5, unit: "°" },
    ],
    now,
  );
}

function renderVerdict() {
  const samples = recorded.length > 0 ? recorded : series;
  const verdict = buildVerdict(samples);
  const fmt = (value: number | null, digits: number) => (value === null ? "-" : value.toFixed(digits));
  verdictTable.innerHTML =
    "<tr><th>信号</th><th>良い姿勢</th><th>頭を前に</th><th>d′ 前−良</th><th>近づく</th><th>d′ 近−良</th></tr>" +
    (Object.keys(SIGNALS) as SignalKey[])
      .map((key) => {
        const row = verdict.rows[key];
        const cell = (stats: typeof row.good) =>
          stats ? `${fmt(stats.mean, SIGNALS[key].digits)}±${fmt(stats.sd, SIGNALS[key].digits)} (${stats.n})` : "-";
        return `<tr><td>${SIGNALS[key].name}</td><td>${cell(row.good)}</td><td>${cell(row.forwardHead)}</td><td><strong>${fmt(row.dForward, 2)}</strong></td><td>${cell(row.closer)}</td><td>${fmt(row.dCloser, 2)}</td></tr>`;
      })
      .join("");
  verdictText.innerHTML =
    `<p class="verdict-${verdict.level}"><strong>${verdict.headline}</strong></p>` +
    `<ul>${verdict.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>` +
    `<p class="note">${recorded.length > 0 ? `記録 ${recorded.length} 件から集計` : "記録がないので直近30秒から集計"}。ラベル切替後 ${SETTLE_MS / 1000} 秒は除外。</p>`;
}

// ---- ワーカーとの通信 -----------------------------------------------------

worker.onmessage = (event: MessageEvent<DepthWorkerResponse>) => {
  const message = event.data;
  if (message.type === "ready") {
    workerReady = true;
    backendLabel = `${message.backend} · ${message.model}`;
    statusEl.textContent = `${backendLabel} · 読み込み ${Math.round(message.loadMs)}ms`;
    return;
  }

  const current = pending;
  pending = null;
  requesting = false;
  if (message.type === "error") {
    statusEl.textContent = `エラー: ${message.message}`;
    current?.frame.close();
    return;
  }
  if (!current || current.id !== message.id || !message.depthMap) {
    current?.frame.close();
    return;
  }

  const map = message.depthMap;
  const now = performance.now();
  const signals = computeSignals(message, map, current, now);
  const sample: Sample = {
    t: now,
    label,
    settled: now - labelChangedAt >= SETTLE_MS,
    earDisparity: message.earDisparity,
    shoulderDisparity: message.shoulderDisparity,
    frameRange: message.frameRange,
    ...signals,
    faceDistanceCm: current.faceDistanceCm,
    mediapipeHeadForwardDeg: current.mediapipeHeadForwardDeg,
    inferenceMs: message.inferenceMs,
    inputWidth: current.inputWidth,
    inputHeight: current.inputHeight,
    options: { ...options },
  };
  series.push(sample);
  while (series.length > 0 && series[0].t < now - SERIES_WINDOW_MS) series.shift();
  if (recording) recorded.push(sample);

  const { probes } = current;
  const { lo, hi } = displayRange(map);
  const shoulderPixels = probes.shoulder.map((point) => toDepthPixel(point, map));
  const earPixels = probes.ear.map((point) => toDepthPixel(point, map));
  const neckX = Math.round((shoulderPixels[0].x + shoulderPixels[1].x) / 2);
  const shoulderY = Math.round((shoulderPixels[0].y + shoulderPixels[1].y) / 2);
  const earY = Math.round(earPixels.reduce((sum, p) => sum + p.y, 0) / earPixels.length);

  drawFrame(current.frame, probes, current.landmarks);
  current.frame.close();
  drawDepth(map, probes, lo, hi, neckX, shoulderY, personBox(probes, map));
  drawVerticalProfile(map, neckX, lo, hi, [
    [earY, css("--ear"), "耳の高さ"],
    [shoulderY, css("--shoulder"), "肩の高さ"],
  ]);
  drawHorizontalProfile(map, shoulderY, lo, hi, shoulderPixels.map((p) => [p.x, css("--shoulder")]));
  renderPatchTable(map, probes);
  renderSummary(sample);
  drawAllSeries(now);
  renderVerdict();
  statusEl.textContent = `${backendLabel} · 推論 ${Math.round(message.inferenceMs)}ms${recording ? ` · 記録中 ${recorded.length}件` : ""}`;
};

async function requestDepth(now: number) {
  const probes = buildDepthProbePoints(latestLandmarks, video.videoWidth, video.videoHeight, options);
  if (!probes) {
    statusEl.textContent = `${backendLabel} · 両肩と片耳が見える位置に座ってください`;
    return;
  }

  const { width, height } = getDepthInputSize(
    video.videoWidth,
    video.videoHeight,
    Number(inputHeightSelect.value),
  );
  const id = nextId++;
  requesting = true;
  lastDepthAt = now;
  pending = {
    id,
    probes,
    landmarks: latestLandmarks,
    frame: await createImageBitmap(video, { resizeWidth: width, resizeHeight: height }),
    inputWidth: width,
    inputHeight: height,
    mediapipeHeadForwardDeg: latestHeadForwardDeg,
    faceDistanceCm: latestFaceDistanceCm,
    shoulderWidthPx: shoulderWidthPx(latestLandmarks),
  };
  // 表示用とは別に、ワーカーへ渡す（所有権ごと移る）ビットマップを作る。
  const bitmap = await createImageBitmap(pending.frame);
  const request: DepthWorkerRequest = { type: "estimate", id, bitmap, probes, includeDepthMap: true };
  worker.postMessage(request, [bitmap]);
}

// ---- ループと UI ----------------------------------------------------------

function tick() {
  requestAnimationFrame(tick);
  if (!poseLandmarker || video.readyState < 2 || frozen) {
    return;
  }

  const now = performance.now();
  if (now - lastPoseAt >= POSE_INTERVAL_MS) {
    lastPoseAt = now;
    const result = poseLandmarker.detectForVideo(video, now);
    latestLandmarks = result.landmarks[0] ?? null;
    const evaluated = evaluatePostureFrame(engineState, now, latestLandmarks, result.worldLandmarks[0] ?? null);
    engineState = evaluated.state;
    latestHeadForwardDeg = evaluated.result.experiment.headForwardAngleDeg;
    if (faceLandmarker) {
      const face = faceLandmarker.detectForVideo(video, now);
      latestFaceDistanceCm = faceDistanceFromMatrix(face.facialTransformationMatrixes[0]);
    }
  }

  if (workerReady && !requesting && now - lastDepthAt >= Number(intervalSelect.value)) {
    void requestDepth(now).catch((error) => {
      pending?.frame.close();
      pending = null;
      requesting = false;
      statusEl.textContent = `フレーム取得に失敗: ${String(error)}`;
    });
  }
}

function setLabel(next: Label) {
  if (next !== label) {
    labelChangedAt = performance.now();
  }
  label = next;
  document.querySelectorAll<HTMLButtonElement>("[data-label]").forEach((button) => {
    button.classList.toggle("active", button.dataset.label === next);
  });
}

function toCsv(samples: Sample[]) {
  const columns: [string, (s: Sample) => number | string | boolean | null][] = [
    ["t_ms", (s) => Math.round(s.t - (samples[0]?.t ?? 0))],
    ["label", (s) => s.label],
    ["settled", (s) => s.settled],
    ["ear_disparity", (s) => s.earDisparity],
    ["shoulder_disparity", (s) => s.shoulderDisparity],
    ["frame_range", (s) => s.frameRange],
    ["old_metric", (s) => s.oldMetric],
    ["ear_change", (s) => s.earChange],
    ["shoulder_change", (s) => s.shoulderChange],
    ["neck_change", (s) => s.neckChange],
    ["fit_r2", (s) => s.fitR2],
    ["fit_scale", (s) => s.fitScale],
    ["face_distance_cm", (s) => s.faceDistanceCm],
    ["face_forward_cm", (s) => s.faceForwardCm],
    ["mediapipe_head_forward_deg", (s) => s.mediapipeHeadForwardDeg],
    ["inference_ms", (s) => Math.round(s.inferenceMs)],
    ["input_width", (s) => s.inputWidth],
    ["input_height", (s) => s.inputHeight],
    ["ear_inward", (s) => s.options.earInwardRatio],
    ["shoulder_inward", (s) => s.options.shoulderInwardRatio],
    ["patch_radius_ratio", (s) => s.options.patchRadiusRatio],
  ];
  const cell = (value: number | string | boolean | null) => (value === null ? "" : String(value));
  return [
    columns.map(([name]) => name).join(","),
    ...samples.map((s) => columns.map(([, pick]) => cell(pick(s))).join(",")),
  ].join("\n");
}

function bindControls() {
  for (const [id, key] of sliders) {
    const input = $<HTMLInputElement>(id);
    const output = $<HTMLOutputElement>(`${id}-value`);
    input.value = String(options[key]);
    output.textContent = options[key].toFixed(2);
    input.addEventListener("input", () => {
      options[key] = Number(input.value);
      output.textContent = options[key].toFixed(2);
    });
  }

  // 解像度が変わると基準フレームと画素が対応しなくなるので、基準を取り直す。
  inputHeightSelect.addEventListener("change", resetBaseline);

  freezeButton.addEventListener("click", () => {
    frozen = !frozen;
    freezeButton.textContent = frozen ? "再開" : "一時停止";
  });

  $<HTMLButtonElement>("reset-baseline").addEventListener("click", resetBaseline);

  recordButton.addEventListener("click", () => {
    recording = !recording;
    if (recording) recorded.length = 0;
    recordButton.textContent = recording ? "記録停止" : "記録開始";
    recordButton.classList.toggle("active", recording);
    downloadButton.disabled = recording || recorded.length === 0;
  });

  downloadButton.addEventListener("click", () => {
    const blob = new Blob([toCsv(recorded)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `depth-probe-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-label]").forEach((button) => {
    button.addEventListener("click", () => setLabel(button.dataset.label as Label));
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }
    const next = LABEL_KEYS[event.key];
    if (next) setLabel(next);
  });
}

async function createLandmarkers() {
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
  const pose = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  const face = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    });
  poseLandmarker = await pose("GPU").catch(() => pose("CPU"));
  faceLandmarker = await face("GPU").catch(() => face("CPU"));
}

async function main() {
  bindControls();
  worker.postMessage({ type: "init" } satisfies DepthWorkerRequest);
  statusEl.textContent = "カメラと MediaPipe を初期化中...（深度モデルは初回のみ数十MBをダウンロード）";

  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  await video.play();
  await createLandmarkers();
  if (!workerReady) {
    statusEl.textContent = "深度モデルを読み込み中...";
  }
  requestAnimationFrame(tick);
}

main().catch((error) => {
  statusEl.textContent = `初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
});
