import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

import { POSE_LANDMARK_INDEX } from "../constants";
import type { DepthProbePoints, ProbePoint } from "./depthProbe.types";

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;
const PATCH_SIZE = 14;
const MIN_VISIBILITY = 0.5;

// ランドマークは輪郭の端に乗りやすく、そのまま深度を読むと背景を拾う。
// 肩は肩中点へ、耳は鼻へ寄せて、身体の内側を読む。
const SHOULDER_INWARD_RATIO = 0.2;
const EAR_INWARD_RATIO = 0.25;
const PATCH_RADIUS_TO_SHOULDER_WIDTH = 0.06;

/** ViT のパッチサイズ（14）の倍数に丸めた入力サイズを、映像の縦横比から求める。 */
export function getDepthInputSize(
  videoWidth: number,
  videoHeight: number,
  inputHeight: number,
) {
  const height = Math.max(PATCH_SIZE, Math.round(inputHeight / PATCH_SIZE) * PATCH_SIZE);
  const width = Math.max(
    PATCH_SIZE,
    Math.round((height * videoWidth) / videoHeight / PATCH_SIZE) * PATCH_SIZE,
  );
  return { width, height };
}

const isVisible = (landmark: NormalizedLandmark | undefined): landmark is NormalizedLandmark =>
  landmark !== undefined && (landmark.visibility ?? 0) >= MIN_VISIBILITY;

const lerp = (from: ProbePoint, to: ProbePoint, t: number): ProbePoint => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

/**
 * 深度を読む位置を、画素単位で縦横比をそろえた座標で決めてから正規化座標に戻す。
 * 両肩と、少なくとも片耳が見えていないときは null。
 */
export function buildDepthProbePoints(
  landmarks: NormalizedLandmark[] | null,
  imageWidth: number,
  imageHeight: number,
): DepthProbePoints | null {
  if (!landmarks) {
    return null;
  }

  const leftShoulder = landmarks[POSE_LANDMARK_INDEX.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARK_INDEX.RIGHT_SHOULDER];
  if (!isVisible(leftShoulder) || !isVisible(rightShoulder)) {
    return null;
  }

  const ears = [
    landmarks[POSE_LANDMARK_INDEX.LEFT_EAR],
    landmarks[POSE_LANDMARK_INDEX.RIGHT_EAR],
  ].filter(isVisible);
  if (ears.length === 0) {
    return null;
  }

  const toPixel = (landmark: NormalizedLandmark): ProbePoint => ({
    x: landmark.x * imageWidth,
    y: landmark.y * imageHeight,
  });
  const toNormalized = (point: ProbePoint): ProbePoint => ({
    x: point.x / imageWidth,
    y: point.y / imageHeight,
  });

  const shoulderL = toPixel(leftShoulder);
  const shoulderR = toPixel(rightShoulder);
  const shoulderMid = lerp(shoulderL, shoulderR, 0.5);
  const shoulderWidthPx = Math.hypot(shoulderL.x - shoulderR.x, shoulderL.y - shoulderR.y);
  if (shoulderWidthPx < 1) {
    return null;
  }

  const nose = landmarks[POSE_LANDMARK_INDEX.NOSE];
  const headCenter = isVisible(nose)
    ? toPixel(nose)
    : lerp(...(ears.map(toPixel) as [ProbePoint, ProbePoint]), 0.5);

  return {
    shoulder: [shoulderL, shoulderR].map((point) =>
      toNormalized(lerp(point, shoulderMid, SHOULDER_INWARD_RATIO)),
    ),
    ear: ears.map((ear) => toNormalized(lerp(toPixel(ear), headCenter, EAR_INWARD_RATIO))),
    radiusPx: shoulderWidthPx * PATCH_RADIUS_TO_SHOULDER_WIDTH,
    imageWidth,
  };
}

/** RGBA 画素列を Depth Anything の入力（1x3xHxW, ImageNet 正規化）に変換する。 */
export function rgbaToPixelValues(rgba: Uint8ClampedArray, width: number, height: number) {
  const plane = width * height;
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[c * plane + i] = (rgba[i * 4 + c] / 255 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
    }
  }
  return out;
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 正規化座標の周辺パッチの中央値。半径は元画像の画素単位で受け取り、深度マップの画素に換算する。 */
export function sampleDepthMedian(
  depth: Float32Array,
  width: number,
  height: number,
  point: ProbePoint,
  radiusPx: number,
  imageWidth: number,
) {
  const radius = Math.max(1, Math.round((radiusPx * width) / imageWidth));
  const cx = Math.round(point.x * (width - 1));
  const cy = Math.round(point.y * (height - 1));
  const values: number[] = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x += 1) {
      values.push(depth[y * width + x]);
    }
  }
  return median(values);
}

/** 点群それぞれの中央値をさらに平均する。読めた点がなければ null。 */
export function sampleGroup(
  depth: Float32Array,
  width: number,
  height: number,
  points: ProbePoint[],
  radiusPx: number,
  imageWidth: number,
) {
  const values = points
    .map((point) => sampleDepthMedian(depth, width, height, point, radiusPx, imageWidth))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** 深度マップの 5〜95 パーセンタイル幅。フレームごとのスケールの目安に使う。 */
export function depthRange(depth: Float32Array, stride = 7) {
  const values: number[] = [];
  for (let i = 0; i < depth.length; i += stride) {
    values.push(depth[i]);
  }
  values.sort((a, b) => a - b);
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
  return at(0.95) - at(0.05);
}
