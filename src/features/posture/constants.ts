export const TRACKING_INTERVAL_MS = 40;
export const BACKGROUND_TRACKING_INTERVAL_MS = 220;
export const UI_UPDATE_INTERVAL_MS = 80;
export const RUNTIME_ERROR_STATUS_INTERVAL_MS = 1200;
export const BACKGROUND_ALERT_COOLDOWN_MS = 20_000;

export const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
export const VISION_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

export const POSE_LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

export const POSE_OVERLAY_LANDMARK = POSE_LANDMARK_INDEX;
