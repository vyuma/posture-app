import { DrawingUtils, NormalizedLandmark } from "@mediapipe/tasks-vision";

import { POSE_OVERLAY_LANDMARK } from "../constants";

export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[] | null,
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
