import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import {
  BACKGROUND_ALERT_COOLDOWN_MS,
  BACKGROUND_TRACKING_INTERVAL_MS,
  POSE_MODEL_URL,
  RUNTIME_ERROR_STATUS_INTERVAL_MS,
  TRACKING_INTERVAL_MS,
  UI_UPDATE_INTERVAL_MS,
  VISION_WASM_URL,
} from "../constants";
import {
  POSTURE_SPEC,
  createPostureEngineState,
  evaluatePostureFrame,
} from "../engine";
import { drawPoseOverlay } from "../services/drawPoseOverlay";
import type { PostureExperimentMetrics } from "../engine";
import type {
  PostureExperimentSample,
  RuntimeSnapshot,
  TrackingMode,
} from "../types";

const EXPERIMENT_HISTORY_LIMIT = 600;
const EXPERIMENT_SMOOTHING_WINDOW = 8;

const DEFAULT_EXPERIMENT: PostureExperimentMetrics = {
  neckAngle2dFallback: null,
  neckAngle3d: null,
  noseShoulderZDelta: null,
  headForwardAngleDeg: null,
  sourceQuality: "insufficient",
  proxy: null,
};

const DEFAULT_SNAPSHOT: RuntimeSnapshot = {
  postureState: "hold",
  qualityOk: false,
  view: "unknown",
  isHeadTurned: false,
  headYawRatio: null,
  score: 0,
  candidateBad: false,
  warmupRemainingMs: POSTURE_SPEC.warmupMs,
  baselineReady: false,
  usingWorldLandmarks: false,
  features: null,
  headWidthRatio: null,
  headWidthScale: null,
  headWidthScoreBoost: 0,
  trackingMode: "foreground",
  trackingIntervalMs: TRACKING_INTERVAL_MS,
  experiment: DEFAULT_EXPERIMENT,
};

type ExperimentNumericKey =
  | "neckAngle2dFallback"
  | "neckAngle3d"
  | "noseShoulderZDelta"
  | "headForwardAngleDeg";

function appendLimited<T>(items: T[], item: T, limit: number) {
  const next = [...items, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function smoothNullableMetric(
  current: PostureExperimentMetrics,
  frames: PostureExperimentMetrics[],
  key: ExperimentNumericKey,
) {
  if (current[key] === null) {
    return null;
  }

  const values = frames
    .map((frame) => frame[key])
    .filter((value): value is number => value !== null);

  return values.length > 0 ? average(values) : current[key];
}

function smoothProxyPoint<
  PointKey extends keyof NonNullable<PostureExperimentMetrics["proxy"]>,
>(
  current: NonNullable<PostureExperimentMetrics["proxy"]>[PointKey],
  frames: PostureExperimentMetrics[],
  key: PointKey,
) {
  if (current === null) {
    return null;
  }

  const points = frames
    .map((frame) => frame.proxy?.[key] ?? null)
    .filter((point): point is NonNullable<typeof current> => point !== null);

  if (points.length === 0) {
    return current;
  }

  return {
    y: average(points.map((point) => point.y)),
    z: average(points.map((point) => point.z)),
    visibility: Math.min(...points.map((point) => point.visibility)),
  };
}

function smoothExperimentMetrics(
  current: PostureExperimentMetrics,
  frames: PostureExperimentMetrics[],
): PostureExperimentMetrics {
  const neckAngle2dFallback = smoothNullableMetric(
    current,
    frames,
    "neckAngle2dFallback",
  );
  const neckAngle3d = smoothNullableMetric(current, frames, "neckAngle3d");
  const proxy = current.proxy
    ? {
        nose: smoothProxyPoint(current.proxy.nose, frames, "nose")!,
        earMidpoint: smoothProxyPoint(
          current.proxy.earMidpoint,
          frames,
          "earMidpoint",
        )!,
        shoulderMidpoint: smoothProxyPoint(
          current.proxy.shoulderMidpoint,
          frames,
          "shoulderMidpoint",
        )!,
        hipMidpoint: smoothProxyPoint(current.proxy.hipMidpoint, frames, "hipMidpoint"),
      }
    : null;

  return {
    neckAngle2dFallback,
    neckAngle3d,
    noseShoulderZDelta: smoothNullableMetric(
      current,
      frames,
      "noseShoulderZDelta",
    ),
    headForwardAngleDeg: smoothNullableMetric(
      current,
      frames,
      "headForwardAngleDeg",
    ),
    sourceQuality: current.sourceQuality,
    proxy,
  };
}

function buildExperimentSample(
  timestampMs: number,
  experiment: PostureExperimentMetrics,
): PostureExperimentSample {
  return {
    timestampMs,
    neckAngle2dFallback: experiment.neckAngle2dFallback,
    neckAngle3d: experiment.neckAngle3d,
  };
}

const isWindowBackgrounded = () => {
  if (typeof document === "undefined") {
    return false;
  }

  if (document.visibilityState !== "visible") {
    return true;
  }

  if (typeof document.hasFocus === "function") {
    return !document.hasFocus();
  }

  return false;
};

const getTrackingMode = (): TrackingMode =>
  isWindowBackgrounded() ? "background" : "foreground";

const getTrackingIntervalMs = () =>
  getTrackingMode() === "background"
    ? BACKGROUND_TRACKING_INTERVAL_MS
    : TRACKING_INTERVAL_MS;

export function usePostureTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackingTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastInferenceAtRef = useRef(0);
  const lastUiUpdateAtRef = useRef(0);
  const lastRuntimeErrorAtRef = useRef(0);
  const lastBackgroundAlertAtRef = useRef(0);
  const trackingModeRef = useRef<TrackingMode>("foreground");
  const engineStateRef = useRef(createPostureEngineState());
  const experimentHistoryRef = useRef<PostureExperimentSample[]>([]);
  const experimentSmoothingRef = useRef<PostureExperimentMetrics[]>([]);
  const isBadPostureRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("カメラとPoseモデルを初期化しています...");
  const [isBadPosture, setIsBadPosture] = useState(false);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(DEFAULT_SNAPSHOT);
  const [experimentHistory, setExperimentHistory] = useState<
    PostureExperimentSample[]
  >([]);

  const clearTrackingTimer = useCallback(() => {
    if (trackingTimerRef.current === null) {
      return;
    }

    window.clearTimeout(trackingTimerRef.current);
    trackingTimerRef.current = null;
  }, []);

  const resetPostureEngine = useCallback(() => {
    engineStateRef.current = createPostureEngineState();
    experimentHistoryRef.current = [];
    experimentSmoothingRef.current = [];
    setExperimentHistory([]);
    isBadPostureRef.current = false;
    setIsBadPosture(false);
    setSnapshot(DEFAULT_SNAPSHOT);
    setStatus("測定を初期化しました。5秒間、基準線を再学習します。");
  }, []);

  useEffect(() => {
    isBadPostureRef.current = isBadPosture;
  }, [isBadPosture]);

  useEffect(() => {
    let mounted = true;

    const scheduleNext = (delayMs: number, callback: () => void) => {
      clearTrackingTimer();
      trackingTimerRef.current = window.setTimeout(callback, Math.max(0, delayMs));
    };

    const startCamera = async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        throw new Error(
          "この環境では navigator.mediaDevices を利用できません。",
        );
      }

      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        return navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
    };

    const createPoseLandmarker = async (
      vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    ) => {
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch {
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }
    };

    const maybeResumeVideo = async (video: HTMLVideoElement) => {
      if (!video.paused) {
        return;
      }

      try {
        await video.play();
      } catch {
        // ウィンドウ遷移中の一時停止は次ループで再試行する。
      }
    };

    const maybeNotifyBackgroundBadPosture = (now: number) => {
      if (!isWindowBackgrounded() || typeof Notification === "undefined") {
        return;
      }

      if (Notification.permission !== "granted") {
        return;
      }

      if (now - lastBackgroundAlertAtRef.current < BACKGROUND_ALERT_COOLDOWN_MS) {
        return;
      }

      lastBackgroundAlertAtRef.current = now;

      try {
        new Notification("姿勢が悪いです", {
          body: "作業姿勢を戻してください。",
          tag: "posture-bad",
          silent: false,
        });
      } catch {
        // 通知 API を使えない環境では無視する。
      }
    };

    const updateTrackingStatus = (nextMode: TrackingMode) => {
      if (trackingModeRef.current === nextMode) {
        return;
      }

      trackingModeRef.current = nextMode;
      setStatus(
        nextMode === "background"
          ? "バックグラウンド追跡中（省電力モード）"
          : "posture.md 仕様で姿勢を追跡中です。",
      );
    };

    const trackOnce = async () => {
      if (!mounted) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const poseModel = poseLandmarkerRef.current;

      if (!video || !canvas || !poseModel) {
        scheduleNext(100, () => {
          void trackOnce();
        });
        return;
      }

      const trackingMode = getTrackingMode();
      const trackingIntervalMs = getTrackingIntervalMs();
      updateTrackingStatus(trackingMode);

      await maybeResumeVideo(video);

      if (video.readyState < 2) {
        scheduleNext(120, () => {
          void trackOnce();
        });
        return;
      }

      const now = performance.now();
      const elapsedSinceLastInference = now - lastInferenceAtRef.current;
      if (elapsedSinceLastInference < trackingIntervalMs) {
        scheduleNext(trackingIntervalMs - elapsedSinceLastInference, () => {
          void trackOnce();
        });
        return;
      }
      lastInferenceAtRef.current = now;

      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      try {
        const poseResult = poseModel.detectForVideo(video, now);
        const imageLandmarks: NormalizedLandmark[] | null =
          poseResult.landmarks.length > 0 ? poseResult.landmarks[0] : null;
        const worldLandmarks =
          poseResult.worldLandmarks.length > 0
            ? poseResult.worldLandmarks[0]
            : null;

        const { state, result } = evaluatePostureFrame(
          engineStateRef.current,
          now,
          imageLandmarks,
          worldLandmarks,
        );
        engineStateRef.current = state;
        experimentSmoothingRef.current = appendLimited(
          experimentSmoothingRef.current,
          result.experiment,
          EXPERIMENT_SMOOTHING_WINDOW,
        );
        const experiment = smoothExperimentMetrics(
          result.experiment,
          experimentSmoothingRef.current,
        );
        experimentHistoryRef.current = appendLimited(
          experimentHistoryRef.current,
          buildExperimentSample(now, experiment),
          EXPERIMENT_HISTORY_LIMIT,
        );

        if (result.postureState !== "hold") {
          const nextBad = result.postureState === "bad";
          if (nextBad !== isBadPostureRef.current) {
            isBadPostureRef.current = nextBad;
            setIsBadPosture(nextBad);

            if (nextBad) {
              maybeNotifyBackgroundBadPosture(now);
            }
          }
        }

        if (typeof document === "undefined" || document.visibilityState === "visible") {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawPoseOverlay(ctx, canvas, imageLandmarks, experiment);
          }
        }

        const uiUpdateIntervalMs =
          trackingMode === "background"
            ? Math.max(UI_UPDATE_INTERVAL_MS, 600)
            : UI_UPDATE_INTERVAL_MS;

        if (now - lastUiUpdateAtRef.current >= uiUpdateIntervalMs) {
          lastUiUpdateAtRef.current = now;
          setSnapshot({
            postureState: result.postureState,
            qualityOk: result.eval.qualityOk,
            view: result.eval.view,
            isHeadTurned: result.eval.isHeadTurned,
            headYawRatio: result.eval.headYawRatio,
            score: result.eval.score,
            candidateBad: result.eval.candidateBad,
            warmupRemainingMs: result.warmupRemainingMs,
            baselineReady: result.baselineReady,
            usingWorldLandmarks: result.usingWorldLandmarks,
            features: result.features,
            headWidthRatio: result.eval.headWidthRatio,
            headWidthScale: result.eval.headWidthScale,
            headWidthScoreBoost: result.eval.headWidthScoreBoost,
            trackingMode,
            trackingIntervalMs,
            experiment,
          });
          setExperimentHistory([...experimentHistoryRef.current]);
        }
      } catch (runtimeError) {
        if (now - lastRuntimeErrorAtRef.current > RUNTIME_ERROR_STATUS_INTERVAL_MS) {
          lastRuntimeErrorAtRef.current = now;
          setStatus(
            `追跡中に一時エラーが発生しました（自動復旧）: ${
              runtimeError instanceof Error
                ? runtimeError.message
                : String(runtimeError)
            }`,
          );
        }
      }

      scheduleNext(getTrackingIntervalMs(), () => {
        void trackOnce();
      });
    };

    const init = async () => {
      try {
        if (!videoRef.current || !canvasRef.current) {
          return;
        }

        const stream = await startCamera();
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
        const poseLandmarker = await createPoseLandmarker(vision);
        poseLandmarkerRef.current = poseLandmarker;

        if (!mounted) {
          return;
        }

        setReady(true);
        setStatus("posture.md 仕様で姿勢を追跡中です。");

        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "default"
        ) {
          void Notification.requestPermission().catch(() => {
            // 許可ダイアログを表示できない環境では無視する。
          });
        }

        scheduleNext(0, () => {
          void trackOnce();
        });
      } catch (error) {
        if (!mounted && error instanceof Error && error.name === "AbortError") {
          return;
        }

        const message =
          error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        setStatus(`初期化に失敗しました: ${message}`);
      }
    };

    void init();

    return () => {
      mounted = false;
      clearTrackingTimer();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
      lastInferenceAtRef.current = 0;
      lastUiUpdateAtRef.current = 0;
      lastRuntimeErrorAtRef.current = 0;
      lastBackgroundAlertAtRef.current = 0;
      experimentHistoryRef.current = [];
      experimentSmoothingRef.current = [];
    };
  }, [clearTrackingTimer]);

  return {
    videoRef,
    canvasRef,
    ready,
    status,
    isBadPosture,
    snapshot,
    experimentHistory,
    resetPostureEngine,
  };
}
