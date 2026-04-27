import { useEffect, useMemo, useRef, useState } from "react";
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { PairingDialog } from "./features/pairing";
import "./App.css";
import appNameImage from "./assets/app-name.png";
import {
  buildPairingUrl,
  getPairingStatus,
  getPrimaryIpv4,
  getSavedPhoneIp,
  sendPostureSignal,
  startPairingServer,
  stopPairingServer,
} from "./lib/desktopBridge";
import { generateQrDataUrl } from "./lib/qrcode";

const FACE_OUTLINE = [
  [10, 338],
  [338, 297],
  [297, 332],
  [332, 284],
  [284, 251],
  [251, 389],
  [389, 356],
  [356, 454],
  [454, 323],
  [323, 361],
  [361, 288],
  [288, 397],
  [397, 365],
  [365, 379],
  [379, 378],
  [378, 400],
  [400, 377],
  [377, 152],
  [152, 148],
  [148, 176],
  [176, 149],
  [149, 150],
  [150, 136],
  [136, 172],
  [172, 58],
  [58, 132],
  [132, 93],
  [93, 234],
  [234, 127],
  [127, 162],
  [162, 21],
  [21, 54],
  [54, 103],
  [103, 67],
  [67, 109],
  [109, 10],
];

const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const LEFT_IRIS_CENTER = 468;
const RIGHT_EYE_OUTER = 362;
const RIGHT_EYE_INNER = 263;
const RIGHT_IRIS_CENTER = 473;
const NOSE_TIP = 1;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

const DORSO_BAD_FRAME_THRESHOLD = 8;
const DORSO_GOOD_FRAME_THRESHOLD = 5;
// User calibration baseline: slider=50 should match this captured profile.
const CALIBRATED_GAZE_BASE_THRESHOLD = 0.216;
const CALIBRATED_NOSE_BASE_THRESHOLD = 0.0652;
const CALIBRATED_FACE_SIZE_BASE_THRESHOLD = 0.12;
const CALIBRATED_SHOULDER_BASE_THRESHOLD = 0.0272;
const BASELINE_ADAPT_RATE_CENTER = 0.02;

// Slider span: 0 => center*0.2, 100 => center*1.8
const SLIDER_RANGE_RATIO = 0.8;
const TRACKING_INTERVAL_MS = 50;

type VisionModels = {
  faceLandmarker: FaceLandmarker;
  poseLandmarker: PoseLandmarker;
};

type Metrics = {
  gaze: number;
  nose: number;
  faceSize: number;
  shoulder: number;
};

type CriteriaSettings = {
  gaze: number;
  nose: number;
  faceSize: number;
  shoulder: number;
  baselineAdapt: number;
};

type DragState = {
  key: keyof CriteriaSettings;
  startValue: number;
};

type RegisteredPosture = {
  gaze: number;
  noseY: number;
  faceCenterX: number;
  faceCenterY: number;
  faceWidth: number;
  shoulderAngle: number;
  noseX: number;
  leftIrisX: number;
  leftIrisY: number;
  rightIrisX: number;
  rightIrisY: number;
  leftShoulderX: number;
  leftShoulderY: number;
  rightShoulderX: number;
  rightShoulderY: number;
};

type LivePostureSample = {
  gaze: number | null;
  noseY: number | null;
  faceCenterX: number | null;
  faceCenterY: number | null;
  faceWidth: number | null;
  shoulderAngle: number | null;
  noseX: number | null;
  leftIrisX: number | null;
  leftIrisY: number | null;
  rightIrisX: number | null;
  rightIrisY: number | null;
  leftShoulderX: number | null;
  leftShoulderY: number | null;
  rightShoulderX: number | null;
  rightShoulderY: number | null;
};

const DEFAULT_CRITERIA: CriteriaSettings = {
  gaze: 50,
  nose: 50,
  faceSize: 50,
  shoulder: 50,
  baselineAdapt: 50,
};

const getBaselineAdaptRateFromSlider = (value: number) => {
  const normalized = (value - 50) / 50;
  const scale = 1 + normalized * SLIDER_RANGE_RATIO;
  return Math.max(0.0001, BASELINE_ADAPT_RATE_CENTER * scale);
};

const getThresholdFromSlider = (
  key: keyof CriteriaSettings,
  value: number,
) => {
  // Slider 50 = calibrated baseline profile. 0=relaxed, 100=strict.
  const normalized = (value - 50) / 50;
  const scale = 1 - normalized * SLIDER_RANGE_RATIO;

  switch (key) {
    case "gaze":
      return CALIBRATED_GAZE_BASE_THRESHOLD * scale;
    case "nose":
      return CALIBRATED_NOSE_BASE_THRESHOLD * scale;
    case "faceSize":
      return CALIBRATED_FACE_SIZE_BASE_THRESHOLD * scale;
    case "shoulder":
      return CALIBRATED_SHOULDER_BASE_THRESHOLD * scale;
    default:
      return 0;
  }
};

const buildThresholds = (criteria: CriteriaSettings) => ({
  gaze: getThresholdFromSlider("gaze", criteria.gaze),
  nose: getThresholdFromSlider("nose", criteria.nose),
  faceSize: getThresholdFromSlider("faceSize", criteria.faceSize),
  shoulder: getThresholdFromSlider("shoulder", criteria.shoulder),
});

const getLandmarkSafe = (
  landmarks: NormalizedLandmark[],
  index: number,
) => landmarks[index] ?? null;

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelsRef = useRef<VisionModels | null>(null);
  const baselineFaceWidthRef = useRef<number | null>(null);
  const baselineFaceCenterXRef = useRef<number | null>(null);
  const baselineFaceCenterYRef = useRef<number | null>(null);
  const baselineNoseXRef = useRef<number | null>(null);
  const baselineNoseYRef = useRef<number | null>(null);
  const baselineLeftIrisRef = useRef<{ x: number; y: number } | null>(null);
  const baselineRightIrisRef = useRef<{ x: number; y: number } | null>(null);
  const baselineLeftShoulderRef = useRef<{ x: number; y: number } | null>(null);
  const baselineRightShoulderRef = useRef<{ x: number; y: number } | null>(null);
  const lastUiUpdateRef = useRef(0);
  const lastRuntimeErrorAtRef = useRef(0);
  const criteriaRef = useRef<CriteriaSettings>(DEFAULT_CRITERIA);
  const dragStateRef = useRef<DragState | null>(null);
  const registeredPostureRef = useRef<RegisteredPosture | null>(null);
  const livePostureSampleRef = useRef<LivePostureSample>({
    gaze: null,
    noseY: null,
    faceCenterX: null,
    faceCenterY: null,
    faceWidth: null,
    shoulderAngle: null,
    noseX: null,
    leftIrisX: null,
    leftIrisY: null,
    rightIrisX: null,
    rightIrisY: null,
    leftShoulderX: null,
    leftShoulderY: null,
    rightShoulderX: null,
    rightShoulderY: null,
  });
  const isBadPostureRef = useRef(false);
  const lastBroadcastedPostureRef = useRef<boolean | null>(null);
  const badFrameCountRef = useRef(0);
  const goodFrameCountRef = useRef(0);
  const lastInferenceAtRef = useRef(0);

  const [status, setStatus] = useState("カメラを初期化しています...");
  const [ready, setReady] = useState(false);
  const [deviceIp, setDeviceIp] = useState<string | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState("取得中...");
  const [isPairingServerRunning, setIsPairingServerRunning] = useState(false);
  // 実接続状態はバックエンドのペアリング状態で追跡する
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [isPairingDialogOpen, setIsPairingDialogOpen] = useState(false);
  const [criteria, setCriteria] = useState<CriteriaSettings>(DEFAULT_CRITERIA);
  const [metrics, setMetrics] = useState<Metrics>({
    gaze: 0,
    nose: 0,
    faceSize: 0,
    shoulder: 0,
  });
  const [isBadPosture, setIsBadPosture] = useState(false);
  const [registeredPosture, setRegisteredPosture] =
    useState<RegisteredPosture | null>(null);
  const [lastLog, setLastLog] = useState("");

  const updateCriterion = (key: keyof CriteriaSettings, value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    setCriteria((prev) => {
      const next = { ...prev, [key]: clamped };
      criteriaRef.current = next;
      return next;
    });
  };

  const startSliderDrag = (key: keyof CriteriaSettings) => {
    dragStateRef.current = {
      key,
      startValue: criteriaRef.current[key],
    };
  };

  const endSliderDrag = () => {
    dragStateRef.current = null;
  };

  const exportDebugLog = (reason: string, overridePosture?: RegisteredPosture | null) => {
    const activeCriteria = criteriaRef.current;
    const baselineAdaptRate = getBaselineAdaptRateFromSlider(
      activeCriteria.baselineAdapt,
    );
    const payload = {
      timestamp: new Date().toISOString(),
      reason,
      sliderDirection: "左=緩い / 右=厳しい",
      sliders: activeCriteria,
      thresholds: buildThresholds(activeCriteria),
      baselineAdaptRate,
      registeredPosture: overridePosture ?? registeredPostureRef.current,
    };
    const text = JSON.stringify(payload, null, 2);
    console.log("[posture-debug]", payload);
    setLastLog(text);
  };

  const registerCurrentPosture = () => {
    const sample = livePostureSampleRef.current;

    if (
      sample.gaze === null ||
      sample.noseY === null ||
      sample.faceCenterX === null ||
      sample.faceCenterY === null ||
      sample.faceWidth === null ||
      sample.shoulderAngle === null ||
      sample.noseX === null ||
      sample.leftIrisX === null ||
      sample.leftIrisY === null ||
      sample.rightIrisX === null ||
      sample.rightIrisY === null ||
      sample.leftShoulderX === null ||
      sample.leftShoulderY === null ||
      sample.rightShoulderX === null ||
      sample.rightShoulderY === null
    ) {
      setStatus("姿勢登録に失敗しました。顔と肩が映る状態で再度押してください。");
      return;
    }

    const next: RegisteredPosture = {
      gaze: sample.gaze,
      noseY: sample.noseY,
      faceCenterX: sample.faceCenterX,
      faceCenterY: sample.faceCenterY,
      faceWidth: sample.faceWidth,
      shoulderAngle: sample.shoulderAngle,
      noseX: sample.noseX,
      leftIrisX: sample.leftIrisX,
      leftIrisY: sample.leftIrisY,
      rightIrisX: sample.rightIrisX,
      rightIrisY: sample.rightIrisY,
      leftShoulderX: sample.leftShoulderX,
      leftShoulderY: sample.leftShoulderY,
      rightShoulderX: sample.rightShoulderX,
      rightShoulderY: sample.rightShoulderY,
    };

    registeredPostureRef.current = next;
    isBadPostureRef.current = false;
    badFrameCountRef.current = 0;
    goodFrameCountRef.current = 0;
    setIsBadPosture(false);
    setRegisteredPosture(next);
    setStatus("現在の姿勢を良い姿勢として登録しました。");
    exportDebugLog("register_posture", next);
  };

  const modelUrl = useMemo(
    () =>
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    [],
  );
  const poseModelUrl = useMemo(
    () =>
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    [],
  );

  const thresholds = useMemo(() => buildThresholds(criteria), [criteria]);
  const baselineAdaptRate = useMemo(
    () => getBaselineAdaptRateFromSlider(criteria.baselineAdapt),
    [criteria.baselineAdapt],
  );
  useEffect(() => {
    criteriaRef.current = criteria;
  }, [criteria]);

  useEffect(() => {
    let mounted = true;

    const loadConnectionState = async () => {
      const [primaryIpv4, persistedPhoneIp, pairingStatus] = await Promise.all([
        getPrimaryIpv4(),
        getSavedPhoneIp(),
        getPairingStatus(),
      ]);

      if (!mounted) {
        return;
      }

      setDeviceIp(primaryIpv4);
      setPairingToken(pairingStatus.pairingToken ?? null);
      void persistedPhoneIp;

      // アプリ起動時に自動でペアリングサーバーを開始
      if (!pairingStatus.running) {
        const url = await startPairingServer();
        if (mounted && url) {
          setQrPayload(url);
          setIsPairingServerRunning(true);
          setStatus("ペアリングサーバーを自動起動しました。スマホでQRを読み取ってください。");
        }
      } else {
        setIsPairingServerRunning(true);
      }
    };

    void loadConnectionState();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isPairingServerRunning) {
      return;
    }

    let mounted = true;

    const syncPairingState = async () => {
      const pairingStatus = await getPairingStatus();
      if (!mounted) {
        return;
      }

      setPairingToken(pairingStatus.pairingToken ?? null);
      const nextConnected = Boolean(pairingStatus.paired);
      setIsWebSocketConnected(nextConnected);

      if (!pairingStatus.running) {
        if (nextConnected) {
          setIsPairingServerRunning(false);
        } else {
          const url = await startPairingServer();
          if (!mounted) {
            return;
          }
          if (url) {
            setQrPayload(url);
            setIsPairingServerRunning(true);
            setStatus("接続待機に戻りました。QRを再表示しています。");
          }
        }
      } else {
        setIsPairingServerRunning(true);
      }

      if (!nextConnected) {
        return;
      }

      if (!pairingStatus.pairedPhoneIp) {
        return;
      }

      setStatus(`スマホを自動ペアリングしました: ${pairingStatus.pairedPhoneIp}`);
    };

    void syncPairingState();
    const intervalId = window.setInterval(() => {
      void syncPairingState();
    }, 1000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [isPairingServerRunning]);

  useEffect(() => {
    if (!isWebSocketConnected || !isPairingServerRunning) {
      return;
    }

    let mounted = true;

    const stopHostAfterConnected = async () => {
      await stopPairingServer();
      if (mounted) {
        setIsPairingServerRunning(false);
      }
    };

    void stopHostAfterConnected();

    return () => {
      mounted = false;
    };
  }, [isWebSocketConnected, isPairingServerRunning]);

  useEffect(() => {
    const payload =
      qrPayload !== "取得中..."
        ? qrPayload
        : buildPairingUrl(deviceIp ?? "127.0.0.1", pairingToken ?? undefined);

    if (qrPayload === "取得中..." && payload !== qrPayload) {
      setQrPayload(payload);
    }

    const updateQr = async () => {
      await generateQrDataUrl(payload);
    };

    void updateQr();
  }, [deviceIp, pairingToken, qrPayload]);

  useEffect(() => {
    if (lastBroadcastedPostureRef.current !== isBadPosture) {
      lastBroadcastedPostureRef.current = isBadPosture;
      void sendPostureSignal(isBadPosture);
    }
  }, [isBadPosture]);

  useEffect(() => {
    return () => {
      void sendPostureSignal(false);
      void stopPairingServer();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        throw new Error(
          "この環境ではカメラ API (navigator.mediaDevices) が利用できません。" +
            "macOS で Tauri 起動中の場合は tauri.conf.json の bundle.macOS.infoPlist に " +
            "NSCameraUsageDescription を追加し、`bun run tauri dev` 経由で起動してください。",
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

    const createLandmarkers = async (vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) => {
      try {
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: poseModelUrl,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        return { faceLandmarker, poseLandmarker };
      } catch {
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: poseModelUrl,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        return { faceLandmarker, poseLandmarker };
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

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm",
        );

        modelsRef.current = await createLandmarkers(vision);

        if (!mounted) {
          return;
        }

        setReady(true);
        setStatus("カメラ起動中。顔輪郭・視線・鼻・肩を追跡しています。");

        const drawFrame = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const models = modelsRef.current;

          if (!video || !canvas || !models) {
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
            const drawingUtils = new DrawingUtils(ctx);

            const faceResult = models.faceLandmarker.detectForVideo(video, now);
            const poseResult = models.poseLandmarker.detectForVideo(video, now);

            let gazeMetric = 0;
            let noseMetric = 0;
            let faceSizeMetric = 0;
            let shoulderMetric = 0;
            let hasFace = false;
            let hasShoulder = false;
            let currentGaze: number | null = null;
            let currentNoseX: number | null = null;
            let currentNoseY: number | null = null;
            let currentFaceCenterX: number | null = null;
            let currentFaceCenterY: number | null = null;
            let currentFaceWidth: number | null = null;
            let currentShoulderAngle: number | null = null;
            let currentLeftIris: { x: number; y: number } | null = null;
            let currentRightIris: { x: number; y: number } | null = null;
            let currentLeftShoulder: { x: number; y: number } | null = null;
            let currentRightShoulder: { x: number; y: number } | null = null;
            let registeredTranslationX: number | null = null;
            let registeredTranslationY: number | null = null;
            const baselineAdaptRate = getBaselineAdaptRateFromSlider(
              criteriaRef.current.baselineAdapt,
            );
            let faceGuide:
              | {
                  leftEyeCenterX: number;
                  leftEyeCenterY: number;
                  rightEyeCenterX: number;
                  rightEyeCenterY: number;
                  leftEyeWidth: number;
                  rightEyeWidth: number;
                  faceLeftX: number;
                  faceRightX: number;
                  faceTopY: number;
                  faceBottomY: number;
                }
              | null = null;
            if (faceResult.faceLandmarks.length > 0) {
              const landmarks = faceResult.faceLandmarks[0];

              const nose = getLandmarkSafe(landmarks, NOSE_TIP);
              const leftIris = getLandmarkSafe(landmarks, LEFT_IRIS_CENTER);
              const rightIris = getLandmarkSafe(landmarks, RIGHT_IRIS_CENTER);
              const leftEyeInner = getLandmarkSafe(landmarks, LEFT_EYE_INNER);
              const leftEyeOuter = getLandmarkSafe(landmarks, LEFT_EYE_OUTER);
              const rightEyeInner = getLandmarkSafe(landmarks, RIGHT_EYE_INNER);
              const rightEyeOuter = getLandmarkSafe(landmarks, RIGHT_EYE_OUTER);
              const faceLeft = getLandmarkSafe(landmarks, 234);
              const faceRight = getLandmarkSafe(landmarks, 454);

              if (
                nose &&
                leftIris &&
                rightIris &&
                leftEyeInner &&
                leftEyeOuter &&
                rightEyeInner &&
                rightEyeOuter &&
                faceLeft &&
                faceRight
              ) {
                hasFace = true;

                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 2;

                for (const [start, end] of FACE_OUTLINE) {
                  const p1 = getLandmarkSafe(landmarks, start);
                  const p2 = getLandmarkSafe(landmarks, end);
                  if (!p1 || !p2) {
                    continue;
                  }
                  ctx.beginPath();
                  ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                  ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                  ctx.stroke();
                }

                drawingUtils.drawLandmarks([nose], {
                  radius: 6,
                  color: "#ef4444",
                });

                const leftEyeCenterX = (leftEyeInner.x + leftEyeOuter.x) / 2;
                const leftEyeCenterY = (leftEyeInner.y + leftEyeOuter.y) / 2;
                const rightEyeCenterX = (rightEyeInner.x + rightEyeOuter.x) / 2;
                const rightEyeCenterY = (rightEyeInner.y + rightEyeOuter.y) / 2;

                const leftEyeWidth = Math.max(
                  Math.hypot(
                    leftEyeInner.x - leftEyeOuter.x,
                    leftEyeInner.y - leftEyeOuter.y,
                  ),
                  0.0001,
                );
                const rightEyeWidth = Math.max(
                  Math.hypot(
                    rightEyeInner.x - rightEyeOuter.x,
                    rightEyeInner.y - rightEyeOuter.y,
                  ),
                  0.0001,
                );

                const leftIrisOffset = Math.hypot(
                  leftIris.x - leftEyeCenterX,
                  leftIris.y - leftEyeCenterY,
                );
                const rightIrisOffset = Math.hypot(
                  rightIris.x - rightEyeCenterX,
                  rightIris.y - rightEyeCenterY,
                );

                currentGaze =
                  (leftIrisOffset / leftEyeWidth + rightIrisOffset / rightEyeWidth) /
                  2;

                const faceWidth = Math.max(
                  Math.abs(faceRight.x - faceLeft.x),
                  0.0001,
                );
                const faceCenterX = (faceLeft.x + faceRight.x) / 2;
                const faceCenterY =
                  ((landmarks[10]?.y ?? Math.max(nose.y - 0.2, 0)) +
                    (landmarks[152]?.y ?? Math.min(nose.y + 0.2, 1))) /
                  2;
                currentNoseX = nose.x;
                currentNoseY = nose.y;
                currentFaceCenterX = faceCenterX;
                currentFaceCenterY = faceCenterY;
                currentFaceWidth = faceWidth;
                currentLeftIris = { x: leftIris.x, y: leftIris.y };
                currentRightIris = { x: rightIris.x, y: rightIris.y };
                faceGuide = {
                  leftEyeCenterX,
                  leftEyeCenterY,
                  rightEyeCenterX,
                  rightEyeCenterY,
                  leftEyeWidth,
                  rightEyeWidth,
                  faceLeftX: faceLeft.x,
                  faceRightX: faceRight.x,
                  faceTopY: landmarks[10]?.y ?? Math.max(nose.y - 0.2, 0),
                  faceBottomY: landmarks[152]?.y ?? Math.min(nose.y + 0.2, 1),
                };

                if (registeredPostureRef.current) {
                  const reference = registeredPostureRef.current;
                  const translationX = faceCenterX - reference.faceCenterX;
                  const translationY = faceCenterY - reference.faceCenterY;
                  registeredTranslationX = translationX;
                  registeredTranslationY = translationY;
                  const expectedLeftIrisX = reference.leftIrisX + translationX;
                  const expectedLeftIrisY = reference.leftIrisY + translationY;
                  const expectedRightIrisX = reference.rightIrisX + translationX;
                  const expectedRightIrisY = reference.rightIrisY + translationY;
                  const expectedNoseX = reference.noseX + translationX;
                  const expectedNoseY = reference.noseY + translationY;

                  const leftGazeDistance =
                    Math.hypot(
                      leftIris.x - expectedLeftIrisX,
                      leftIris.y - expectedLeftIrisY,
                    ) / Math.max(leftEyeWidth, 0.0001);
                  const rightGazeDistance =
                    Math.hypot(
                      rightIris.x - expectedRightIrisX,
                      rightIris.y - expectedRightIrisY,
                    ) / Math.max(rightEyeWidth, 0.0001);
                  gazeMetric = Math.max(leftGazeDistance, rightGazeDistance);
                  noseMetric = Math.hypot(
                    currentNoseX - expectedNoseX,
                    currentNoseY - expectedNoseY,
                  );
                  faceSizeMetric = Math.abs(
                    currentFaceWidth / Math.max(reference.faceWidth, 0.0001) - 1,
                  );
                } else {
                  if (baselineFaceCenterXRef.current === null) {
                    baselineFaceCenterXRef.current = faceCenterX;
                  } else {
                    baselineFaceCenterXRef.current =
                      baselineFaceCenterXRef.current * (1 - baselineAdaptRate) +
                      faceCenterX * baselineAdaptRate;
                  }

                  if (baselineFaceCenterYRef.current === null) {
                    baselineFaceCenterYRef.current = faceCenterY;
                  } else {
                    baselineFaceCenterYRef.current =
                      baselineFaceCenterYRef.current * (1 - baselineAdaptRate) +
                      faceCenterY * baselineAdaptRate;
                  }

                  if (!baselineLeftIrisRef.current) {
                    baselineLeftIrisRef.current = { x: leftIris.x, y: leftIris.y };
                  } else {
                    baselineLeftIrisRef.current = {
                      x:
                        baselineLeftIrisRef.current.x * (1 - baselineAdaptRate) +
                        leftIris.x * baselineAdaptRate,
                      y:
                        baselineLeftIrisRef.current.y * (1 - baselineAdaptRate) +
                        leftIris.y * baselineAdaptRate,
                    };
                  }

                  if (!baselineRightIrisRef.current) {
                    baselineRightIrisRef.current = { x: rightIris.x, y: rightIris.y };
                  } else {
                    baselineRightIrisRef.current = {
                      x:
                        baselineRightIrisRef.current.x * (1 - baselineAdaptRate) +
                        rightIris.x * baselineAdaptRate,
                      y:
                        baselineRightIrisRef.current.y * (1 - baselineAdaptRate) +
                        rightIris.y * baselineAdaptRate,
                    };
                  }

                  const leftGazeDistance = baselineLeftIrisRef.current
                    && baselineFaceCenterXRef.current !== null
                    && baselineFaceCenterYRef.current !== null
                    ? Math.hypot(
                        leftIris.x -
                          (baselineLeftIrisRef.current.x +
                            (faceCenterX - baselineFaceCenterXRef.current)),
                        leftIris.y -
                          (baselineLeftIrisRef.current.y +
                            (faceCenterY - baselineFaceCenterYRef.current)),
                      ) / Math.max(leftEyeWidth, 0.0001)
                    : 0;
                  const rightGazeDistance = baselineRightIrisRef.current
                    && baselineFaceCenterXRef.current !== null
                    && baselineFaceCenterYRef.current !== null
                    ? Math.hypot(
                        rightIris.x -
                          (baselineRightIrisRef.current.x +
                            (faceCenterX - baselineFaceCenterXRef.current)),
                        rightIris.y -
                          (baselineRightIrisRef.current.y +
                            (faceCenterY - baselineFaceCenterYRef.current)),
                      ) / Math.max(rightEyeWidth, 0.0001)
                    : 0;

                  gazeMetric = Math.max(leftGazeDistance, rightGazeDistance);

                  if (baselineNoseXRef.current === null) {
                    baselineNoseXRef.current = nose.x;
                  } else {
                    baselineNoseXRef.current =
                      baselineNoseXRef.current * (1 - baselineAdaptRate) +
                      nose.x * baselineAdaptRate;
                  }

                  if (baselineNoseYRef.current === null) {
                    baselineNoseYRef.current = nose.y;
                  } else {
                    baselineNoseYRef.current =
                      baselineNoseYRef.current * (1 - baselineAdaptRate) +
                      nose.y * baselineAdaptRate;
                  }

                  noseMetric =
                    baselineNoseXRef.current !== null &&
                    baselineNoseYRef.current !== null &&
                    baselineFaceCenterXRef.current !== null &&
                    baselineFaceCenterYRef.current !== null
                      ? Math.hypot(
                          nose.x -
                            (baselineNoseXRef.current +
                              (faceCenterX - baselineFaceCenterXRef.current)),
                          nose.y -
                            (baselineNoseYRef.current +
                              (faceCenterY - baselineFaceCenterYRef.current)),
                        )
                      : 0;

                  if (baselineFaceWidthRef.current === null) {
                    baselineFaceWidthRef.current = faceWidth;
                  } else {
                    baselineFaceWidthRef.current =
                      baselineFaceWidthRef.current * (1 - baselineAdaptRate) +
                      faceWidth * baselineAdaptRate;
                  }

                  faceSizeMetric = Math.abs(
                    faceWidth / Math.max(baselineFaceWidthRef.current, 0.0001) - 1,
                  );
                }

                const drawGazeVector = (
                  eyeInner: { x: number; y: number },
                  eyeOuter: { x: number; y: number },
                  iris: { x: number; y: number },
                ) => {
                  const eyeCenterX = (eyeInner.x + eyeOuter.x) / 2;
                  const eyeCenterY = (eyeInner.y + eyeOuter.y) / 2;

                  const dx = iris.x - eyeCenterX;
                  const dy = iris.y - eyeCenterY;

                  const startX = eyeCenterX * canvas.width;
                  const startY = eyeCenterY * canvas.height;
                  const endX = (eyeCenterX + dx * 4) * canvas.width;
                  const endY = (eyeCenterY + dy * 4) * canvas.height;

                  ctx.strokeStyle = "#22c55e";
                  ctx.lineWidth = 3;
                  ctx.beginPath();
                  ctx.moveTo(startX, startY);
                  ctx.lineTo(endX, endY);
                  ctx.stroke();

                  ctx.fillStyle = "#22c55e";
                  ctx.beginPath();
                  ctx.arc(
                    iris.x * canvas.width,
                    iris.y * canvas.height,
                    4,
                    0,
                    Math.PI * 2,
                  );
                  ctx.fill();
                };

                drawGazeVector(leftEyeInner, leftEyeOuter, leftIris);
                drawGazeVector(rightEyeInner, rightEyeOuter, rightIris);
              }
            }

            if (poseResult.landmarks.length > 0) {
              const pose = poseResult.landmarks[0];
              const leftShoulder = getLandmarkSafe(pose, LEFT_SHOULDER);
              const rightShoulder = getLandmarkSafe(pose, RIGHT_SHOULDER);

              if (leftShoulder && rightShoulder) {
                hasShoulder = true;
                currentLeftShoulder = { x: leftShoulder.x, y: leftShoulder.y };
                currentRightShoulder = { x: rightShoulder.x, y: rightShoulder.y };

                const shoulderAngle =
                  Math.abs(
                    (Math.atan2(
                      rightShoulder.y - leftShoulder.y,
                      rightShoulder.x - leftShoulder.x,
                    ) *
                      180) /
                      Math.PI,
                  );
                currentShoulderAngle = shoulderAngle;

                if (registeredPostureRef.current) {
                  const reference = registeredPostureRef.current;
                  const referenceShoulderCenterX =
                    (reference.leftShoulderX + reference.rightShoulderX) / 2;
                  const referenceShoulderCenterY =
                    (reference.leftShoulderY + reference.rightShoulderY) / 2;
                  const currentShoulderCenterX =
                    (leftShoulder.x + rightShoulder.x) / 2;
                  const currentShoulderCenterY =
                    (leftShoulder.y + rightShoulder.y) / 2;
                  const translationX =
                    registeredTranslationX ??
                    (currentShoulderCenterX - referenceShoulderCenterX);
                  const translationY =
                    registeredTranslationY ??
                    (currentShoulderCenterY - referenceShoulderCenterY);
                  const expectedLeftShoulderX =
                    reference.leftShoulderX + translationX;
                  const expectedLeftShoulderY =
                    reference.leftShoulderY + translationY;
                  const expectedRightShoulderX =
                    reference.rightShoulderX + translationX;
                  const expectedRightShoulderY =
                    reference.rightShoulderY + translationY;
                  const leftDistance = Math.hypot(
                    leftShoulder.x - expectedLeftShoulderX,
                    leftShoulder.y - expectedLeftShoulderY,
                  );
                  const rightDistance = Math.hypot(
                    rightShoulder.x - expectedRightShoulderX,
                    rightShoulder.y - expectedRightShoulderY,
                  );
                  shoulderMetric = Math.max(leftDistance, rightDistance);
                } else {
                  if (!baselineLeftShoulderRef.current) {
                    baselineLeftShoulderRef.current = {
                      x: leftShoulder.x,
                      y: leftShoulder.y,
                    };
                  } else {
                    baselineLeftShoulderRef.current = {
                      x:
                        baselineLeftShoulderRef.current.x * (1 - baselineAdaptRate) +
                        leftShoulder.x * baselineAdaptRate,
                      y:
                        baselineLeftShoulderRef.current.y * (1 - baselineAdaptRate) +
                        leftShoulder.y * baselineAdaptRate,
                    };
                  }

                  if (!baselineRightShoulderRef.current) {
                    baselineRightShoulderRef.current = {
                      x: rightShoulder.x,
                      y: rightShoulder.y,
                    };
                  } else {
                    baselineRightShoulderRef.current = {
                      x:
                        baselineRightShoulderRef.current.x * (1 - baselineAdaptRate) +
                        rightShoulder.x * baselineAdaptRate,
                      y:
                        baselineRightShoulderRef.current.y * (1 - baselineAdaptRate) +
                        rightShoulder.y * baselineAdaptRate,
                    };
                  }

                  const leftDistance = baselineLeftShoulderRef.current
                    ? Math.hypot(
                        leftShoulder.x - baselineLeftShoulderRef.current.x,
                        leftShoulder.y - baselineLeftShoulderRef.current.y,
                      )
                    : 0;
                  const rightDistance = baselineRightShoulderRef.current
                    ? Math.hypot(
                        rightShoulder.x - baselineRightShoulderRef.current.x,
                        rightShoulder.y - baselineRightShoulderRef.current.y,
                      )
                    : 0;
                  shoulderMetric = Math.max(leftDistance, rightDistance);
                }

                ctx.strokeStyle = "#f97316";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(
                  leftShoulder.x * canvas.width,
                  leftShoulder.y * canvas.height,
                );
                ctx.lineTo(
                  rightShoulder.x * canvas.width,
                  rightShoulder.y * canvas.height,
                );
                ctx.stroke();

                drawingUtils.drawLandmarks([leftShoulder, rightShoulder], {
                  radius: 7,
                  color: "#f97316",
                });
              }
            }

            livePostureSampleRef.current = {
              gaze: currentGaze,
              noseX: currentNoseX,
              noseY: currentNoseY,
              faceCenterX: currentFaceCenterX,
              faceCenterY: currentFaceCenterY,
              faceWidth: currentFaceWidth,
              shoulderAngle: currentShoulderAngle,
              leftIrisX: currentLeftIris?.x ?? null,
              leftIrisY: currentLeftIris?.y ?? null,
              rightIrisX: currentRightIris?.x ?? null,
              rightIrisY: currentRightIris?.y ?? null,
              leftShoulderX: currentLeftShoulder?.x ?? null,
              leftShoulderY: currentLeftShoulder?.y ?? null,
              rightShoulderX: currentRightShoulder?.x ?? null,
              rightShoulderY: currentRightShoulder?.y ?? null,
            };

            const liveThresholds = buildThresholds(criteriaRef.current);
            const activeDrag = dragStateRef.current;

            let renderedRangeGuide = false;
            ctx.save();

            if (faceGuide) {
              const registered = registeredPostureRef.current;
              const faceTranslationX =
                registered && currentFaceCenterX !== null
                  ? currentFaceCenterX - registered.faceCenterX
                  : 0;
              const faceTranslationY =
                registered && currentFaceCenterY !== null
                  ? currentFaceCenterY - registered.faceCenterY
                  : 0;

              const leftOrigin = registered
                ? {
                    x: registered.leftIrisX + faceTranslationX,
                    y: registered.leftIrisY + faceTranslationY,
                  }
                : baselineLeftIrisRef.current;
              const rightOrigin = registered
                ? {
                    x: registered.rightIrisX + faceTranslationX,
                    y: registered.rightIrisY + faceTranslationY,
                  }
                : baselineRightIrisRef.current;

              const drawEyeRange = (
                originX: number,
                originY: number,
                eyeWidth: number,
              ) => {
                const radius = eyeWidth * liveThresholds.gaze * canvas.width;
                ctx.beginPath();
                ctx.arc(
                  originX * canvas.width,
                  originY * canvas.height,
                  Math.max(radius, 4),
                  0,
                  Math.PI * 2,
                );
                ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
                ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();
              };

              if (leftOrigin) {
                drawEyeRange(leftOrigin.x, leftOrigin.y, faceGuide.leftEyeWidth);
                renderedRangeGuide = true;
              }
              if (rightOrigin) {
                drawEyeRange(rightOrigin.x, rightOrigin.y, faceGuide.rightEyeWidth);
                renderedRangeGuide = true;
              }

              const noseBaseY = registered
                ? registered.noseY
                : baselineNoseYRef.current;
              if (
                noseBaseY !== null &&
                currentFaceCenterX !== null &&
                currentFaceCenterY !== null
              ) {
                const referenceFaceCenterX = registered
                  ? registered.faceCenterX
                  : baselineFaceCenterXRef.current;
                const referenceFaceCenterY = registered
                  ? registered.faceCenterY
                  : baselineFaceCenterYRef.current;
                const referenceNoseX = registered
                  ? registered.noseX
                  : baselineNoseXRef.current;

                if (
                  referenceFaceCenterX !== null &&
                  referenceFaceCenterY !== null &&
                  referenceNoseX !== null
                ) {
                  const translationX = currentFaceCenterX - referenceFaceCenterX;
                  const translationY = currentFaceCenterY - referenceFaceCenterY;
                  const expectedNoseX = referenceNoseX + translationX;
                  const expectedNoseY = noseBaseY + translationY;
                  const faceSpan = Math.max(
                    (faceGuide.faceRightX - faceGuide.faceLeftX) * canvas.width,
                    1,
                  );
                  const radius = Math.max(faceSpan * liveThresholds.nose, 8);

                  ctx.beginPath();
                  ctx.arc(
                    expectedNoseX * canvas.width,
                    expectedNoseY * canvas.height,
                    radius,
                    0,
                    Math.PI * 2,
                  );
                  ctx.fillStyle = "rgba(34, 197, 94, 0.22)";
                  ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
                  ctx.lineWidth = 2;
                  ctx.fill();
                  ctx.stroke();
                }
                renderedRangeGuide = true;
              }

              const faceBaseWidth = registered
                ? registered.faceWidth
                : baselineFaceWidthRef.current;
              if (
                faceBaseWidth !== null &&
                currentFaceCenterX !== null &&
                currentFaceCenterY !== null
              ) {
                const allowedWidth = faceBaseWidth * (1 + liveThresholds.faceSize);
                const referenceFaceCenterX = registered
                  ? registered.faceCenterX
                  : baselineFaceCenterXRef.current;
                const referenceFaceCenterY = registered
                  ? registered.faceCenterY
                  : baselineFaceCenterYRef.current;

                const expectedCenterX =
                  referenceFaceCenterX !== null
                    ? referenceFaceCenterX +
                      (currentFaceCenterX - referenceFaceCenterX)
                    : currentFaceCenterX;
                const expectedCenterY =
                  referenceFaceCenterY !== null
                    ? referenceFaceCenterY +
                      (currentFaceCenterY - referenceFaceCenterY)
                    : currentFaceCenterY;

                const innerRadius = Math.max((faceBaseWidth * canvas.width) / 2, 10);
                const outerRadius = Math.max((allowedWidth * canvas.width) / 2, innerRadius + 4);

                ctx.beginPath();
                ctx.arc(
                  expectedCenterX * canvas.width,
                  expectedCenterY * canvas.height,
                  outerRadius,
                  0,
                  Math.PI * 2,
                );
                ctx.fillStyle = "rgba(34, 197, 94, 0.14)";
                ctx.fill();

                ctx.setLineDash([8, 5]);
                ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(
                  expectedCenterX * canvas.width,
                  expectedCenterY * canvas.height,
                  outerRadius,
                  0,
                  Math.PI * 2,
                );
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.strokeStyle = "rgba(22, 163, 74, 0.95)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(
                  expectedCenterX * canvas.width,
                  expectedCenterY * canvas.height,
                  innerRadius,
                  0,
                  Math.PI * 2,
                );
                ctx.stroke();
                renderedRangeGuide = true;
              }
            }

            if (hasShoulder) {
              const registered = registeredPostureRef.current;
              const referenceShoulderCenterX = registered
                ? (registered.leftShoulderX + registered.rightShoulderX) / 2
                : null;
              const referenceShoulderCenterY = registered
                ? (registered.leftShoulderY + registered.rightShoulderY) / 2
                : null;
              const currentShoulderCenterX =
                currentLeftShoulder && currentRightShoulder
                  ? (currentLeftShoulder.x + currentRightShoulder.x) / 2
                  : null;
              const currentShoulderCenterY =
                currentLeftShoulder && currentRightShoulder
                  ? (currentLeftShoulder.y + currentRightShoulder.y) / 2
                  : null;
              const shoulderTranslationX =
                registeredTranslationX ??
                (currentShoulderCenterX !== null && referenceShoulderCenterX !== null
                  ? currentShoulderCenterX - referenceShoulderCenterX
                  : 0);
              const shoulderTranslationY =
                registeredTranslationY ??
                (currentShoulderCenterY !== null && referenceShoulderCenterY !== null
                  ? currentShoulderCenterY - referenceShoulderCenterY
                  : 0);

              const leftOrigin = registered
                ? {
                    x: registered.leftShoulderX + shoulderTranslationX,
                    y: registered.leftShoulderY + shoulderTranslationY,
                  }
                : baselineLeftShoulderRef.current;
              const rightOrigin = registered
                ? {
                    x: registered.rightShoulderX + shoulderTranslationX,
                    y: registered.rightShoulderY + shoulderTranslationY,
                  }
                : baselineRightShoulderRef.current;
              const radius = Math.max(liveThresholds.shoulder * canvas.width, 6);

              const drawShoulderRange = (origin: { x: number; y: number }) => {
                ctx.beginPath();
                ctx.arc(
                  origin.x * canvas.width,
                  origin.y * canvas.height,
                  radius,
                  0,
                  Math.PI * 2,
                );
                ctx.fillStyle = "rgba(34, 197, 94, 0.22)";
                ctx.strokeStyle = "rgba(34, 197, 94, 0.92)";
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();
              };

              if (leftOrigin) {
                drawShoulderRange(leftOrigin);
                renderedRangeGuide = true;
              }
              if (rightOrigin) {
                drawShoulderRange(rightOrigin);
                renderedRangeGuide = true;
              }
            }

            if (activeDrag) {
              if (activeDrag.key === "baselineAdapt") {
                const guideWidth = 260;
                const barHeight = 14;
                const x = 20;
                const y = 56;
                const ratio = Math.max(
                  0,
                  Math.min(
                    1,
                    (baselineAdaptRate / BASELINE_ADAPT_RATE_CENTER -
                      (1 - SLIDER_RANGE_RATIO)) /
                      (2 * SLIDER_RANGE_RATIO),
                  ),
                );

                ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
                ctx.fillRect(x, y, guideWidth, barHeight);
                ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
                ctx.fillRect(x, y, guideWidth * ratio, barHeight);
                ctx.strokeStyle = "rgba(34, 197, 94, 1)";
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, guideWidth, barHeight);

                ctx.font = "600 13px 'Segoe UI', 'Noto Sans', sans-serif";
                ctx.fillStyle = "#f8fafc";
                ctx.fillText(
                  `基準追従率: ${baselineAdaptRate.toFixed(4)} / frame`,
                  x,
                  y + 32,
                );
              }
            }

            void renderedRangeGuide;

            ctx.restore();

            const gazeBad = hasFace && gazeMetric > liveThresholds.gaze;
            const noseBad =
              hasFace &&
              noseMetric > liveThresholds.nose;
            const faceSizeBad =
              hasFace &&
              faceSizeMetric > liveThresholds.faceSize;
            const shoulderBad =
              hasShoulder &&
              shoulderMetric > liveThresholds.shoulder;
            const badCandidate = gazeBad || noseBad || faceSizeBad || shoulderBad;

            if (badCandidate) {
              badFrameCountRef.current += 1;
              goodFrameCountRef.current = 0;
            } else {
              goodFrameCountRef.current += 1;
              badFrameCountRef.current = 0;
            }

            let nextBadState = isBadPostureRef.current;

            if (
              !isBadPostureRef.current &&
              badFrameCountRef.current >= DORSO_BAD_FRAME_THRESHOLD
            ) {
              nextBadState = true;
            } else if (
              isBadPostureRef.current &&
              goodFrameCountRef.current >= DORSO_GOOD_FRAME_THRESHOLD
            ) {
              nextBadState = false;
            }

            if (nextBadState !== isBadPostureRef.current) {
              isBadPostureRef.current = nextBadState;
              setIsBadPosture(nextBadState);
            }

            if (now - lastUiUpdateRef.current > 120) {
              lastUiUpdateRef.current = now;
              setMetrics({
                gaze: gazeMetric,
                nose: noseMetric,
                faceSize: faceSizeMetric,
                shoulder: shoulderMetric,
              });
            }
          } catch (runtimeError) {
            const now = performance.now();
            if (now - lastRuntimeErrorAtRef.current > 1200) {
              lastRuntimeErrorAtRef.current = now;
              setStatus(
                `追跡中に一時エラーが発生しました（自動継続）: ${
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
        const errorMessage =
          error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        setStatus(
          `カメラまたはモデル初期化に失敗しました: ${errorMessage}`,
        );
      }
    };

    init();

    return () => {
      mounted = false;

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      baselineFaceWidthRef.current = null;
      baselineFaceCenterXRef.current = null;
      baselineFaceCenterYRef.current = null;
      baselineNoseXRef.current = null;
      baselineNoseYRef.current = null;
      baselineLeftIrisRef.current = null;
      baselineRightIrisRef.current = null;
      baselineLeftShoulderRef.current = null;
      baselineRightShoulderRef.current = null;
      lastInferenceAtRef.current = 0;
      isBadPostureRef.current = false;
      badFrameCountRef.current = 0;
      goodFrameCountRef.current = 0;
      livePostureSampleRef.current = {
        gaze: null,
        noseX: null,
        noseY: null,
        faceCenterX: null,
        faceCenterY: null,
        faceWidth: null,
        shoulderAngle: null,
        leftIrisX: null,
        leftIrisY: null,
        rightIrisX: null,
        rightIrisY: null,
        leftShoulderX: null,
        leftShoulderY: null,
        rightShoulderX: null,
        rightShoulderY: null,
      };

      modelsRef.current?.faceLandmarker.close();
      modelsRef.current?.poseLandmarker.close();
      modelsRef.current = null;
    };
  }, [modelUrl, poseModelUrl]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-topline">
          <div>
            <img
              className="app-name-image"
              src={appNameImage}
              alt="姿勢カメラトラッカー"
            />
            <p>
              Windowsカメラ映像に、顔輪郭・視線方向・鼻先・肩位置をリアルタイム表示します。
            </p>
            <div className={`status ${ready ? "ok" : "warn"}`}>{status}</div>
          </div>

          <button
            type="button"
            className="pairing-launch"
            onClick={() => setIsPairingDialogOpen(true)}
          >
            モバイル連携
          </button>
        </div>
      </section>

      <section className="workbench">
        <aside className="control-panel">
          <h2>判定しきい値</h2>
          <p className="panel-note">
            スライダーは左=緩い、右=厳しい。各項目を個別に調整できます。
          </p>



          <button type="button" onClick={registerCurrentPosture}>
            現在の姿勢を登録
          </button>

          <button type="button" onClick={() => exportDebugLog("manual_export")}>
            数値をログ出力
          </button>

          <p className="panel-note">
            {registeredPosture
              ? "登録済み: ボタンを押した瞬間を良姿勢として使用中"
              : "未登録: これまでと同じ自動基準で動作中"}
          </p>

          <div className="criterion-meta">
            <span>登録姿勢(目線) {registeredPosture ? registeredPosture.gaze.toFixed(3) : "-"}</span>
            <span>登録姿勢(鼻Y) {registeredPosture ? registeredPosture.noseY.toFixed(3) : "-"}</span>
            <span>登録姿勢(顔幅) {registeredPosture ? registeredPosture.faceWidth.toFixed(3) : "-"}</span>
            <span>登録姿勢(肩角度) {registeredPosture ? `${registeredPosture.shoulderAngle.toFixed(2)}°` : "-"}</span>
          </div>

          <label className="criterion" htmlFor="gaze-range">
            <span>目線</span>
            <div className="axis-note" aria-hidden="true">
              <span>左: 緩い</span>
              <span>右: 厳しい</span>
            </div>
            <input
              id="gaze-range"
              type="range"
              min={0}
              max={100}
              value={criteria.gaze}
              onChange={(e) => updateCriterion("gaze", Number(e.currentTarget.value))}
              onPointerDown={() => startSliderDrag("gaze")}
              onPointerUp={endSliderDrag}
              onPointerCancel={endSliderDrag}
              onBlur={endSliderDrag}
            />
            <div className="criterion-meta">
              <span>設定 {criteria.gaze}</span>
              <span>現在 {metrics.gaze.toFixed(3)}</span>
              <span>閾値 {thresholds.gaze.toFixed(3)}</span>
            </div>
          </label>

          <label className="criterion" htmlFor="nose-range">
            <span>鼻の位置(縦)</span>
            <div className="axis-note" aria-hidden="true">
              <span>左: 緩い</span>
              <span>右: 厳しい</span>
            </div>
            <input
              id="nose-range"
              type="range"
              min={0}
              max={100}
              value={criteria.nose}
              onChange={(e) => updateCriterion("nose", Number(e.currentTarget.value))}
              onPointerDown={() => startSliderDrag("nose")}
              onPointerUp={endSliderDrag}
              onPointerCancel={endSliderDrag}
              onBlur={endSliderDrag}
            />
            <div className="criterion-meta">
              <span>設定 {criteria.nose}</span>
              <span>現在 {metrics.nose.toFixed(3)}</span>
              <span>閾値 {thresholds.nose.toFixed(3)}</span>
            </div>
          </label>

          <label className="criterion" htmlFor="face-size-range">
            <span>顔の大きさ</span>
            <div className="axis-note" aria-hidden="true">
              <span>左: 緩い</span>
              <span>右: 厳しい</span>
            </div>
            <input
              id="face-size-range"
              type="range"
              min={0}
              max={100}
              value={criteria.faceSize}
              onChange={(e) =>
                updateCriterion("faceSize", Number(e.currentTarget.value))
              }
              onPointerDown={() => startSliderDrag("faceSize")}
              onPointerUp={endSliderDrag}
              onPointerCancel={endSliderDrag}
              onBlur={endSliderDrag}
            />
            <div className="criterion-meta">
              <span>設定 {criteria.faceSize}</span>
              <span>現在 {metrics.faceSize.toFixed(3)}</span>
              <span>閾値 {thresholds.faceSize.toFixed(3)}</span>
            </div>
          </label>

          <label className="criterion" htmlFor="shoulder-range">
            <span>肩位置(左右2点)</span>
            <div className="axis-note" aria-hidden="true">
              <span>左: 緩い</span>
              <span>右: 厳しい</span>
            </div>
            <input
              id="shoulder-range"
              type="range"
              min={0}
              max={100}
              value={criteria.shoulder}
              onChange={(e) =>
                updateCriterion("shoulder", Number(e.currentTarget.value))
              }
              onPointerDown={() => startSliderDrag("shoulder")}
              onPointerUp={endSliderDrag}
              onPointerCancel={endSliderDrag}
              onBlur={endSliderDrag}
            />
            <div className="criterion-meta">
              <span>設定 {criteria.shoulder}</span>
              <span>現在 {metrics.shoulder.toFixed(3)}</span>
              <span>閾値 {thresholds.shoulder.toFixed(3)}</span>
            </div>
          </label>

          <label className="criterion" htmlFor="baseline-adapt-range">
            <span>基準位置の追従速度</span>
            <div className="axis-note" aria-hidden="true">
              <span>左: 遅い</span>
              <span>右: 速い</span>
            </div>
            <input
              id="baseline-adapt-range"
              type="range"
              min={0}
              max={100}
              value={criteria.baselineAdapt}
              onChange={(e) =>
                updateCriterion("baselineAdapt", Number(e.currentTarget.value))
              }
              onPointerDown={() => startSliderDrag("baselineAdapt")}
              onPointerUp={endSliderDrag}
              onPointerCancel={endSliderDrag}
              onBlur={endSliderDrag}
            />
            <div className="criterion-meta">
              <span>設定 {criteria.baselineAdapt}</span>
              <span>追従率 {baselineAdaptRate.toFixed(4)}</span>
              <span>既定 {BASELINE_ADAPT_RATE_CENTER.toFixed(4)}</span>
            </div>
          </label>

          <label className="criterion" htmlFor="debug-log-output">
            <span>最新ログ(JSON)</span>
            <textarea
              id="debug-log-output"
              readOnly
              value={lastLog}
              rows={8}
            />
          </label>
        </aside>

        <section className="viewer">
          <video ref={videoRef} className="camera" playsInline muted />
          <canvas ref={canvasRef} className="overlay" />

          {isBadPosture ? (
            <div className="posture-alert" role="status" aria-live="polite">
              姿勢が悪い
            </div>
          ) : null}

          <div className="legend">
            <span className="item face">顔輪郭</span>
            <span className="item gaze">視線</span>
            <span className="item nose">鼻</span>
            <span className="item shoulder">肩</span>
          </div>
        </section>
      </section>

      {isPairingDialogOpen ? (
        <PairingDialog onClose={() => setIsPairingDialogOpen(false)} />
      ) : null}
    </main>
  );
}

export default App;
