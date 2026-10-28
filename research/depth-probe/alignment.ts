import type { DepthMap, DepthProbePoints } from "../../src/features/posture/depth/depthProbe.types";

/**
 * 人物を囲む矩形（深度マップの画素）。肩幅を単位に、頭の上と左右に余白をとる。
 * 下端は画像の下まで（胴体が続くため）。
 */
export type PersonBox = { x0: number; x1: number; y0: number };

export function personBox(probes: DepthProbePoints, map: DepthMap): PersonBox {
  const xs = [...probes.ear, ...probes.shoulder].map((p) => p.x * (map.width - 1));
  const ys = [...probes.ear, ...probes.shoulder].map((p) => p.y * (map.height - 1));
  const shoulderWidth = Math.abs(
    (probes.shoulder[0].x - probes.shoulder[1].x) * (map.width - 1),
  );
  return {
    x0: Math.min(...xs) - shoulderWidth * 0.6,
    x1: Math.max(...xs) + shoulderWidth * 0.6,
    y0: Math.min(...ys) - shoulderWidth * 1.0,
  };
}

const inBox = (box: PersonBox, x: number, y: number) => x >= box.x0 && x <= box.x1 && y >= box.y0;

export type AffineFit = { a: number; b: number; r2: number; count: number };

/**
 * 背景画素で current を reference に合わせる a·current + b を最小二乗で求める。
 * 単色の壁などで背景の奥行きにばらつきがないと a が決まらないので、a=1 へ弱く引き寄せる。
 */
export function fitBackgroundAffine(
  current: DepthMap,
  reference: DepthMap,
  boxes: PersonBox[],
  stride = 3,
): AffineFit | null {
  if (current.width !== reference.width || current.height !== reference.height) {
    return null;
  }

  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let y = 0; y < current.height; y += stride) {
    for (let x = 0; x < current.width; x += stride) {
      if (boxes.some((box) => inBox(box, x, y))) continue;
      const i = y * current.width + x;
      const cx = current.data[i];
      const ry = reference.data[i];
      n += 1;
      sx += cx;
      sy += ry;
      sxx += cx * cx;
      sxy += cx * ry;
      syy += ry * ry;
    }
  }
  if (n < 50) {
    return null;
  }

  const varX = sxx / n - (sx / n) ** 2;
  const covXY = sxy / n - (sx / n) * (sy / n);
  const varY = syy / n - (sy / n) ** 2;
  // リッジ項：varX が小さいときほど a=1 が優先される。
  const lambda = Math.max(1e-6, varY * 0.01);
  const a = (covXY + lambda) / (varX + lambda);
  const b = sy / n - a * (sx / n);
  const residual = syy / n - 2 * a * (sxy / n) - 2 * b * (sy / n) + a * a * (sxx / n) + 2 * a * b * (sx / n) + b * b;
  const r2 = varY > 0 ? 1 - residual / varY : 0;
  return { a, b, r2, count: n };
}
