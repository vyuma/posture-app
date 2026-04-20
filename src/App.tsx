import { useEffect, useMemo, useRef, useState } from "react";
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import "./App.css";

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
const DORSO_GAZE_BASE_THRESHOLD = 0.12;
const DORSO_NOSE_DEAD_ZONE = 0.03;
const DORSO_FORWARD_HEAD_BASE_THRESHOLD = 0.05;
const DORSO_SHOULDER_BASE_THRESHOLD = 8.5;

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
};

type RegisteredPosture = {
  gaze: number;
  noseY: number;
  faceWidth: number;
  shoulderAngle: number;
};

type LivePostureSample = {
  gaze: number | null;
  noseY: number | null;
  faceWidth: number | null;
  shoulderAngle: number | null;
};

const DEFAULT_CRITERIA: CriteriaSettings = {
  gaze: 50,
  nose: 50,
  faceSize: 50,
  shoulder: 50,
};

const getThresholdFromSlider = (
  key: keyof CriteriaSettings,
  value: number,
) => {
  // Slider 50 means Dorso-like default. 0=relaxed, 100=strict.
  const normalized = (value - 50) / 50;
  const scale = 1 - normalized * 0.8;

  switch (key) {
    case "gaze":
      return DORSO_GAZE_BASE_THRESHOLD * scale;
    case "nose":
      return DORSO_NOSE_DEAD_ZONE * scale;
    case "faceSize":
      return DORSO_FORWARD_HEAD_BASE_THRESHOLD * scale;
    case "shoulder":
      return DORSO_SHOULDER_BASE_THRESHOLD * scale;
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
  const baselineNoseYRef = useRef<number | null>(null);
  const lastUiUpdateRef = useRef(0);
  const lastRuntimeErrorAtRef = useRef(0);
  const criteriaRef = useRef<CriteriaSettings>(DEFAULT_CRITERIA);
  const registeredPostureRef = useRef<RegisteredPosture | null>(null);
  const livePostureSampleRef = useRef<LivePostureSample>({
    gaze: null,
    noseY: null,
    faceWidth: null,
    shoulderAngle: null,
  });
  const isBadPostureRef = useRef(false);
  const badFrameCountRef = useRef(0);
  const goodFrameCountRef = useRef(0);

  const [status, setStatus] = useState("カメラを初期化しています...");
  const [ready, setReady] = useState(false);
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

  const exportDebugLog = (reason: string, overridePosture?: RegisteredPosture | null) => {
    const activeCriteria = criteriaRef.current;
    const payload = {
      timestamp: new Date().toISOString(),
      reason,
      sliderDirection: "左=緩い / 右=厳しい",
      sliders: activeCriteria,
      thresholds: buildThresholds(activeCriteria),
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
      sample.faceWidth === null ||
      sample.shoulderAngle === null
    ) {
      setStatus("姿勢登録に失敗しました。顔と肩が映る状態で再度押してください。");
      return;
    }

    const next: RegisteredPosture = {
      gaze: sample.gaze,
      noseY: sample.noseY,
      faceWidth: sample.faceWidth,
      shoulderAngle: sample.shoulderAngle,
    };

    registeredPostureRef.current = next;
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

  useEffect(() => {
    criteriaRef.current = criteria;
  }, [criteria]);

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
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

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            animationRef.current = requestAnimationFrame(drawFrame);
            return;
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          try {
            const drawingUtils = new DrawingUtils(ctx);
            const now = performance.now();

            const faceResult = models.faceLandmarker.detectForVideo(video, now);
            const poseResult = models.poseLandmarker.detectForVideo(video, now);

            let gazeMetric = 0;
            let noseMetric = 0;
            let faceSizeMetric = 0;
            let shoulderMetric = 0;
            let hasFace = false;
            let hasShoulder = false;
            let currentGaze: number | null = null;
            let currentNoseY: number | null = null;
            let currentFaceWidth: number | null = null;
            let currentShoulderAngle: number | null = null;

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
                currentNoseY = nose.y;
                currentFaceWidth = faceWidth;

                if (registeredPostureRef.current) {
                  gazeMetric = Math.abs(
                    currentGaze - registeredPostureRef.current.gaze,
                  );
                  noseMetric = Math.max(
                    0,
                    currentNoseY - registeredPostureRef.current.noseY,
                  );
                  faceSizeMetric = Math.max(
                    0,
                    currentFaceWidth /
                      Math.max(registeredPostureRef.current.faceWidth, 0.0001) -
                      1,
                  );
                } else {
                  gazeMetric = currentGaze;

                  if (baselineNoseYRef.current === null) {
                    baselineNoseYRef.current = nose.y;
                  } else {
                    baselineNoseYRef.current =
                      baselineNoseYRef.current * 0.995 + nose.y * 0.005;
                  }

                  noseMetric = Math.max(0, nose.y - baselineNoseYRef.current);

                  if (baselineFaceWidthRef.current === null) {
                    baselineFaceWidthRef.current = faceWidth;
                  } else {
                    baselineFaceWidthRef.current =
                      baselineFaceWidthRef.current * 0.995 + faceWidth * 0.005;
                  }

                  faceSizeMetric = Math.max(
                    0,
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

                shoulderMetric =
                  Math.abs(
                    (Math.atan2(
                      rightShoulder.y - leftShoulder.y,
                      rightShoulder.x - leftShoulder.x,
                    ) *
                      180) /
                      Math.PI,
                  );
                currentShoulderAngle = shoulderMetric;

                if (registeredPostureRef.current) {
                  shoulderMetric = Math.abs(
                    shoulderMetric - registeredPostureRef.current.shoulderAngle,
                  );
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
              noseY: currentNoseY,
              faceWidth: currentFaceWidth,
              shoulderAngle: currentShoulderAngle,
            };

            const liveThresholds = buildThresholds(criteriaRef.current);
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
      baselineNoseYRef.current = null;
      isBadPostureRef.current = false;
      badFrameCountRef.current = 0;
      goodFrameCountRef.current = 0;
      livePostureSampleRef.current = {
        gaze: null,
        noseY: null,
        faceWidth: null,
        shoulderAngle: null,
      };

      modelsRef.current?.faceLandmarker.close();
      modelsRef.current?.poseLandmarker.close();
      modelsRef.current = null;
    };
  }, [modelUrl, poseModelUrl]);

  return (
    <main className="app-shell">
      <section className="hero">
        <h1>姿勢カメラトラッカー</h1>
        <p>
          Windowsカメラ映像に、顔輪郭・視線方向・鼻先・肩位置をリアルタイム表示します。
        </p>
        <div className={`status ${ready ? "ok" : "warn"}`}>{status}</div>
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
            />
            <div className="criterion-meta">
              <span>設定 {criteria.faceSize}</span>
              <span>現在 {metrics.faceSize.toFixed(3)}</span>
              <span>閾値 {thresholds.faceSize.toFixed(3)}</span>
            </div>
          </label>

          <label className="criterion" htmlFor="shoulder-range">
            <span>肩の傾き</span>
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
            />
            <div className="criterion-meta">
              <span>設定 {criteria.shoulder}</span>
              <span>現在 {metrics.shoulder.toFixed(2)}°</span>
              <span>閾値 {thresholds.shoulder.toFixed(2)}°</span>
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

          {isBadPosture && <div className="posture-alert show">姿勢が悪い</div>}

          <div className="legend">
            <span className="item face">顔輪郭</span>
            <span className="item gaze">視線</span>
            <span className="item nose">鼻</span>
            <span className="item shoulder">肩</span>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
