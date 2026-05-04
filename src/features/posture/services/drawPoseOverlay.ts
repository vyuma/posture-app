import { DrawingUtils, NormalizedLandmark } from "@mediapipe/tasks-vision";

import { POSE_OVERLAY_LANDMARK } from "../constants";
import type { PostureExperimentMetrics } from "../engine.types";
import { normalizeAngle } from "../utils/angles";
import { clamp, normalizeVector2D } from "../utils/math";

export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[] | null,
  experiment: PostureExperimentMetrics | null = null,
) {
  if (!landmarks || landmarks.length === 0) {
    return;
  }

  const drawingUtils = new DrawingUtils(ctx);

  const nose = landmarks[POSE_OVERLAY_LANDMARK.NOSE] ?? null;
  const leftEar = landmarks[POSE_OVERLAY_LANDMARK.LEFT_EAR] ?? null;
  const rightEar = landmarks[POSE_OVERLAY_LANDMARK.RIGHT_EAR] ?? null;
  const leftShoulder = landmarks[POSE_OVERLAY_LANDMARK.LEFT_SHOULDER] ?? null;
  const rightShoulder = landmarks[POSE_OVERLAY_LANDMARK.RIGHT_SHOULDER] ?? null;
  const leftHip = landmarks[POSE_OVERLAY_LANDMARK.LEFT_HIP] ?? null;
  const rightHip = landmarks[POSE_OVERLAY_LANDMARK.RIGHT_HIP] ?? null;

  const drawConnection = (
    a: NormalizedLandmark | null,
    b: NormalizedLandmark | null,
    color: string,
    lineWidth = 3,
  ) => {
    if (!a || !b) {
      return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  };

  drawConnection(leftShoulder, rightShoulder, "#f97316", 4);
  drawConnection(leftHip, rightHip, "#22c55e", 4);
  drawConnection(leftShoulder, leftHip, "#38bdf8", 2);
  drawConnection(rightShoulder, rightHip, "#38bdf8", 2);
  drawConnection(leftEar, rightEar, "#60a5fa", 2);

  const earMidpoint =
    leftEar && rightEar
      ? {
          x: (leftEar.x + rightEar.x) / 2,
          y: (leftEar.y + rightEar.y) / 2,
        }
      : null;
  const shoulderMidpoint =
    leftShoulder && rightShoulder
      ? {
          x: (leftShoulder.x + rightShoulder.x) / 2,
          y: (leftShoulder.y + rightShoulder.y) / 2,
        }
      : null;
  const hipMidpoint =
    leftHip && rightHip
      ? {
          x: (leftHip.x + rightHip.x) / 2,
          y: (leftHip.y + rightHip.y) / 2,
        }
      : null;

  if (nose && earMidpoint) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(earMidpoint.x * canvas.width, earMidpoint.y * canvas.height);
    ctx.lineTo(nose.x * canvas.width, nose.y * canvas.height);
    ctx.stroke();
    ctx.restore();

    const center = {
      x: earMidpoint.x * canvas.width,
      y: earMidpoint.y * canvas.height,
    };
    const nosePoint = {
      x: nose.x * canvas.width,
      y: nose.y * canvas.height,
    };
    const torsoVector =
      shoulderMidpoint && hipMidpoint
        ? {
            x: (shoulderMidpoint.x - hipMidpoint.x) * canvas.width,
            y: (shoulderMidpoint.y - hipMidpoint.y) * canvas.height,
          }
        : { x: 0, y: -1 };
    const torsoUnit = normalizeVector2D(torsoVector);

    if (torsoUnit) {
      const referenceLength = Math.max(52, Math.min(canvas.width, canvas.height) * 0.16);
      ctx.save();
      ctx.setLineDash([8, 7]);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(37, 99, 235, 0.72)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(
        center.x + torsoUnit.x * referenceLength,
        center.y + torsoUnit.y * referenceLength,
      );
      ctx.stroke();
      ctx.restore();

      drawAngleWedge(
        ctx,
        center,
        Math.atan2(torsoUnit.y, torsoUnit.x),
        Math.atan2(nosePoint.y - center.y, nosePoint.x - center.x),
        Math.max(28, Math.min(canvas.width, canvas.height) * 0.06),
        "#2563eb",
      );
    }
  }

  if (nose && earMidpoint && experiment?.noseShoulderZDelta != null) {
    const zShiftPx = clamp(
      experiment.noseShoulderZDelta * canvas.width * 0.8,
      -180,
      180,
    );
    const intensity = clamp(Math.abs(zShiftPx) / 140, 0.25, 1);
    const startX = earMidpoint.x * canvas.width;
    const startY = earMidpoint.y * canvas.height;
    const endX = nose.x * canvas.width + zShiftPx;
    const endY = nose.y * canvas.height;

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(239, 68, 68, ${intensity})`;
    ctx.lineWidth = 4 + intensity * 3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.fillStyle = `rgba(239, 68, 68, ${intensity})`;
    ctx.beginPath();
    ctx.arc(endX, endY, 5 + intensity * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (nose) {
    drawingUtils.drawLandmarks([nose], {
      radius: 6,
      color: "#ef4444",
    });
  }

  const earPoints = [leftEar, rightEar].filter(
    (point): point is NormalizedLandmark => point !== null,
  );
  if (earPoints.length > 0) {
    drawingUtils.drawLandmarks(earPoints, {
      radius: 5,
      color: "#60a5fa",
    });
  }

  const shoulderPoints = [leftShoulder, rightShoulder].filter(
    (point): point is NormalizedLandmark => point !== null,
  );
  if (shoulderPoints.length > 0) {
    drawingUtils.drawLandmarks(shoulderPoints, {
      radius: 6,
      color: "#f97316",
    });
  }

  const hipPoints = [leftHip, rightHip].filter(
    (point): point is NormalizedLandmark => point !== null,
  );
  if (hipPoints.length > 0) {
    drawingUtils.drawLandmarks(hipPoints, {
      radius: 6,
      color: "#22c55e",
    });
  }
}

function drawAngleWedge(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  startAngle: number,
  endAngle: number,
  radius: number,
  color: string,
) {
  const delta = normalizeAngle(endAngle - startAngle);
  const arcEnd = startAngle + delta;
  const anticlockwise = delta < 0;

  ctx.save();
  ctx.fillStyle = toRgba(color, 0.18);
  ctx.strokeStyle = toRgba(color, 0.95);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.arc(center.x, center.y, radius, startAngle, arcEnd, anticlockwise);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, startAngle, arcEnd, anticlockwise);
  ctx.stroke();
  ctx.restore();
}

function toRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
