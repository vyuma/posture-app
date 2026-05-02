import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import {
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
import type { RuntimeSnapshot } from "../types";

const DEFAULT_SNAPSHOT: RuntimeSnapshot = {
  postureState: "hold",
  qualityOk: false,
  view: "unknown",
  score: 0,
  candidateBad: false,
  warmupRemainingMs: POSTURE_SPEC.warmupMs,
  baselineReady: false,
  usingWorldLandmarks: false,
  features: null,
};

export function usePostureTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastInferenceAtRef = useRef(0);
  const lastUiUpdateAtRef = useRef(0);
  const lastRuntimeErrorAtRef = useRef(0);
  const engineStateRef = useRef(createPostureEngineState());
  const isBadPostureRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("カメラとPoseモデルを初期化しています...");
  const [isBadPosture, setIsBadPosture] = useState(false);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(DEFAULT_SNAPSHOT);

  const resetPostureEngine = useCallback(() => {
    engineStateRef.current = createPostureEngineState();
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

        const drawFrame = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const poseModel = poseLandmarkerRef.current;

          if (!video || !canvas || !poseModel) {
            return;
          }

          if (video.readyState < 2) {
            animationRef.current = requestAnimationFrame(drawFrame);
            return;
          }

          const now = performance.now();
          if (now - lastInferenceAtRef.current < TRACKING_INTERVAL_MS) {
            animationRef.current = requestAnimationFrame(drawFrame);
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

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            animationRef.current = requestAnimationFrame(drawFrame);
            return;
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);

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

            if (result.postureState !== "hold") {
              const nextBad = result.postureState === "bad";
              if (nextBad !== isBadPostureRef.current) {
                isBadPostureRef.current = nextBad;
                setIsBadPosture(nextBad);
              }
            }

            drawPoseOverlay(ctx, canvas, imageLandmarks);

            if (now - lastUiUpdateAtRef.current >= UI_UPDATE_INTERVAL_MS) {
              lastUiUpdateAtRef.current = now;
              setSnapshot({
                postureState: result.postureState,
                qualityOk: result.eval.qualityOk,
                view: result.eval.view,
                score: result.eval.score,
                candidateBad: result.eval.candidateBad,
                warmupRemainingMs: result.warmupRemainingMs,
                baselineReady: result.baselineReady,
                usingWorldLandmarks: result.usingWorldLandmarks,
                features: result.features,
              });
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

          animationRef.current = requestAnimationFrame(drawFrame);
        };

        animationRef.current = requestAnimationFrame(drawFrame);
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

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
      lastInferenceAtRef.current = 0;
      lastUiUpdateAtRef.current = 0;
      lastRuntimeErrorAtRef.current = 0;
    };
  }, []);

  return {
    videoRef,
    canvasRef,
    ready,
    status,
    isBadPosture,
    snapshot,
    resetPostureEngine,
  };
}
