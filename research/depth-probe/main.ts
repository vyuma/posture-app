import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import {
  DEPTH_PROBE_BASELINE_MS,
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

type Label = "none" | "good" | "forward-head" | "slouch" | "turned";

type PendingFrame = {
  id: number;
  sentAt: number;
  probes: DepthProbePoints;
  landmarks: NormalizedLandmark[] | null;
  frame: ImageBitmap;
  inputWidth: number;
  inputHeight: number;
  mediapipeHeadForwardDeg: number | null;
};

type Sample = {
  t: number;
  label: Label;
  earDisparity: number | null;
  shoulderDisparity: number | null;
  delta: number | null;
  frameRange: number;
  normalized: number | null;
  fromBaseline: number | null;
  mediapipeHeadForwardDeg: number | null;
  inferenceMs: number;
  inputWidth: number;
  inputHeight: number;
  options: DepthProbeOptions;
};

const SERIES_WINDOW_MS = 30_000;
const POSE_INTERVAL_MS = 33;
const LABEL_KEYS: Record<string, Label> = {
  "0": "none",
  "1": "good",
  "2": "forward-head",
  "3": "slouch",
  "4": "turned",
};
const LABEL_TINT: Record<Label, string | null> = {
  none: null,
  good: "rgba(64, 192, 87, 0.14)",
  "forward-head": "rgba(250, 82, 82, 0.14)",
  slouch: "rgba(250, 176, 5, 0.16)",
  turned: "rgba(132, 94, 247, 0.14)",
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
const seriesCanvas = $<HTMLCanvasElement>("series");
const patchTable = $<HTMLTableElement>("patches");
const summaryList = $<HTMLDListElement>("summary");
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
let engineState = createPostureEngineState();
let latestLandmarks: NormalizedLandmark[] | null = null;
let latestHeadForwardDeg: number | null = null;
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
let baseline: number | null = null;
let baselineStartedAt: number | null = null;
let baselineSamples: number[] = [];
const series: Sample[] = [];
const recorded: Sample[] = [];

const worker = new Worker(
  new URL("../../src/features/posture/depth/depth.worker.ts", import.meta.url),
  { type: "module" },
);

// ---- 計算 ----------------------------------------------------------------

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) {
    return NaN;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

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

function trackBaseline(value: number, now: number) {
  if (baseline !== null) {
    return value - baseline;
  }
  baselineStartedAt ??= now;
  baselineSamples.push(value);
  if (now - baselineStartedAt >= DEPTH_PROBE_BASELINE_MS && baselineSamples.length >= 5) {
    const sorted = [...baselineSamples].sort((a, b) => a - b);
    baseline = quantile(sorted, 0.5);
    return value - baseline;
  }
  return null;
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

function drawDepth(map: DepthMap, probes: DepthProbePoints, lo: number, hi: number, neckX: number, shoulderY: number) {
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
  const items: [string, string][] = [
    ["耳の視差", fmt(sample.earDisparity)],
    ["肩の視差", fmt(sample.shoulderDisparity)],
    ["耳−肩", fmt(sample.delta)],
    ["フレームのレンジ(p5–p95)", fmt(sample.frameRange)],
    ["正規化", fmt(sample.normalized)],
    ["基準から", baseline === null ? "基準を学習中" : fmt(sample.fromBaseline)],
    ["MediaPipe 頭部前傾角", fmt(sample.mediapipeHeadForwardDeg, 1)],
    ["入力サイズ", `${sample.inputWidth}×${sample.inputHeight}`],
    ["推論", `${Math.round(sample.inferenceMs)}ms`],
  ];
  summaryList.innerHTML = items.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
}

function drawSeries(now: number) {
  const { ctx, width, height } = prepareCanvas(seriesCanvas);
  const pad = 28;
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

  const values = visible.flatMap((sample) =>
    [sample.normalized, sample.fromBaseline].filter((v): v is number => v !== null),
  );
  const extent = Math.max(0.05, ...values.map(Math.abs));
  const toY = (value: number) => height / 2 - (value / extent) * (height / 2 - 8);

  ctx.strokeStyle = css("--line");
  ctx.beginPath();
  ctx.moveTo(pad, toY(0));
  ctx.lineTo(width - pad, toY(0));
  ctx.stroke();
  ctx.fillStyle = css("--muted");
  ctx.fillText(`+${extent.toFixed(2)}`, 0, 12);
  ctx.fillText(`-${extent.toFixed(2)}`, 0, height - 4);

  const line = (pick: (sample: Sample) => number | null, color: string, toYFn = toY) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let drawing = false;
    for (const sample of visible) {
      const value = pick(sample);
      if (value === null) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(toX(sample.t), toYFn(value));
      else ctx.moveTo(toX(sample.t), toYFn(value));
      drawing = true;
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  };

  line((s) => s.normalized, css("--normalized"));
  line((s) => s.fromBaseline, css("--baseline"));
  // MediaPipe の角度は ±30° を同じ高さに合わせた右軸で重ねる。
  line((s) => s.mediapipeHeadForwardDeg, css("--mediapipe"), (deg) => height / 2 - (deg / 30) * (height / 2 - 8));
  ctx.fillStyle = css("--muted");
  ctx.fillText("±30°", width - pad + 2, 12);
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
  const delta =
    message.earDisparity !== null && message.shoulderDisparity !== null
      ? message.earDisparity - message.shoulderDisparity
      : null;
  const normalized = delta !== null && message.frameRange > 0 ? delta / message.frameRange : null;
  const sample: Sample = {
    t: now,
    label,
    earDisparity: message.earDisparity,
    shoulderDisparity: message.shoulderDisparity,
    delta,
    frameRange: message.frameRange,
    normalized,
    fromBaseline: normalized !== null ? trackBaseline(normalized, now) : null,
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
  drawDepth(map, probes, lo, hi, neckX, shoulderY);
  drawVerticalProfile(map, neckX, lo, hi, [
    [earY, css("--ear"), "耳の高さ"],
    [shoulderY, css("--shoulder"), "肩の高さ"],
  ]);
  drawHorizontalProfile(map, shoulderY, lo, hi, shoulderPixels.map((p) => [p.x, css("--shoulder")]));
  renderPatchTable(map, probes);
  renderSummary(sample);
  drawSeries(now);
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
    sentAt: now,
    probes,
    landmarks: latestLandmarks,
    frame: await createImageBitmap(video, { resizeWidth: width, resizeHeight: height }),
    inputWidth: width,
    inputHeight: height,
    mediapipeHeadForwardDeg: latestHeadForwardDeg,
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
  label = next;
  document.querySelectorAll<HTMLButtonElement>("[data-label]").forEach((button) => {
    button.classList.toggle("active", button.dataset.label === next);
  });
}

function toCsv(samples: Sample[]) {
  const header = [
    "t_ms", "label", "ear_disparity", "shoulder_disparity", "delta", "frame_range",
    "normalized", "from_baseline", "mediapipe_head_forward_deg", "inference_ms",
    "input_width", "input_height", "ear_inward", "shoulder_inward", "patch_radius_ratio",
  ];
  const cell = (value: number | string | null) => (value === null ? "" : String(value));
  const t0 = samples[0]?.t ?? 0;
  const rows = samples.map((s) =>
    [
      Math.round(s.t - t0), s.label, s.earDisparity, s.shoulderDisparity, s.delta, s.frameRange,
      s.normalized, s.fromBaseline, s.mediapipeHeadForwardDeg, Math.round(s.inferenceMs),
      s.inputWidth, s.inputHeight, s.options.earInwardRatio, s.options.shoulderInwardRatio,
      s.options.patchRadiusRatio,
    ].map(cell).join(","),
  );
  return [header.join(","), ...rows].join("\n");
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

  freezeButton.addEventListener("click", () => {
    frozen = !frozen;
    freezeButton.textContent = frozen ? "再開" : "一時停止";
  });

  $<HTMLButtonElement>("reset-baseline").addEventListener("click", () => {
    baseline = null;
    baselineStartedAt = null;
    baselineSamples = [];
    engineState = createPostureEngineState();
  });

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

async function createPose() {
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
  const create = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  return create("GPU").catch(() => create("CPU"));
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
  poseLandmarker = await createPose();
  if (!workerReady) {
    statusEl.textContent = "深度モデルを読み込み中...";
  }
  requestAnimationFrame(tick);
}

main().catch((error) => {
  statusEl.textContent = `初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
});
