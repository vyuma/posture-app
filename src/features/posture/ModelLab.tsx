/**
 * Web-only test screen (/dev/model), gated by developer access.
 * Runs the real posture engine on the camera and visualises each stage of the
 * mathematical model: features -> baseline (median/MAD) -> z -> weighted score -> EMA -> state.
 * Nothing is saved or sent.
 */
import { FilesetResolver, PoseLandmarker, type Landmark, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { POSE_LANDMARK_INDEX, POSE_MODEL_URL, VISION_WASM_URL } from "./constants";
import { createPostureEngineState, evaluatePostureFrame } from "./engine";
import { pickLandmarkSetFromSource } from "./engine.pose.landmarks";
import { computeFeatureReliability } from "./engine.score";
import { FEATURE_KEYS, POSTURE_SPEC } from "./engine.spec";
import type { BaselineStats, FeatureKey, PostureEngineState, PostureFeatures, PostureFrameResult } from "./engine.types";
import { judgmentScale, type JudgmentSettings } from "./judgment";
import "./model-lab.css";

const FEATURE_META: Record<FeatureKey, { sym: string; label: string; formula: string; unit: string }> = {
  headLateralOffsetRatio: { sym: "x₁", label: "頭の横ずれ", formula: "(N − SM)·ĥ / W", unit: "" },
  earShoulderDistanceRatio: { sym: "x₂", label: "耳–肩距離", formula: "‖EM − SM‖ / W", unit: "" },
  torsoTiltDeg: { sym: "x₃", label: "体の傾き", formula: "∠(t̂, −ŷ)", unit: "°" },
  neckAngleDeg: { sym: "x₄", label: "首の角度", formula: "∠ᵧᵤ(N − EM, t̂)", unit: "°" },
  earShoulderAsymmetryRatio: { sym: "x₅", label: "左右非対称", formula: "|‖EL−SL‖ − ‖ER−SR‖| / W", unit: "" },
  headForwardAngleDeg: { sym: "x₆", label: "頭の前方突出", formula: "∠ᵧᵤ(EM − SM, −ŷ)", unit: "°" },
};

type Frame = {
  result: PostureFrameResult;
  state: PostureEngineState;
  reliability: Record<FeatureKey, number> | null;
  landmarks: NormalizedLandmark[] | null;
  fps: number;
};

const HISTORY = 160;
const fmt = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d));

function zScores(features: PostureFeatures, baseline: BaselineStats) {
  const out = {} as Record<FeatureKey, number | null>;
  for (const key of FEATURE_KEYS) {
    const value = features[key];
    const stats = baseline[key];
    if (value === null) { out[key] = null; continue; }
    if (key === "headForwardAngleDeg") {
      out[key] = stats.sampleCount < POSTURE_SPEC.headForwardMinSamples ? null : Math.max(0, value - stats.median) / stats.scale;
    } else {
      out[key] = Math.abs(value - stats.median) / stats.scale;
    }
  }
  return out;
}

function effectiveWeights(view: string, headTurned: boolean) {
  const w: Record<FeatureKey, number> = { ...POSTURE_SPEC.weights[view === "side" ? "side" : "front"] };
  if (view === "side" || headTurned) {
    const half = POSTURE_SPEC.weights.front.neckAngleDeg * 0.6;
    w.headForwardAngleDeg += w.neckAngleDeg - half;
    w.neckAngleDeg = half;
    w.headLateralOffsetRatio *= 0.8;
  }
  return w;
}

function computeBreakdown(
  result: PostureFrameResult | null,
  state: PostureEngineState | null,
  rel: Record<FeatureKey, number> | null,
  scale: number,
) {
  const baseline = state?.baseline ?? null;
  const features = result?.features ?? null;
  const z = features && baseline ? zScores(features, baseline) : null;
  const weights = effectiveWeights(result?.eval.view ?? "unknown", result?.eval.isHeadTurned ?? false);
  let num = 0;
  let den = 0;
  let baseDen = 0;
  for (const key of FEATURE_KEYS) {
    const w = weights[key] * Math.min(1, Math.max(0, rel?.[key] ?? 0));
    baseDen += weights[key];
    const zk = z?.[key];
    if (zk === null || zk === undefined || w <= 1e-6) continue;
    num += w * Math.min(Math.max(zk, 0), POSTURE_SPEC.scoreZClamp);
    den += w;
  }
  const boost = result?.eval.headWidthScoreBoost ?? 0;
  const raw = den > 1e-6 ? num / den + boost : null;
  const confidence = rel ? FEATURE_KEYS.reduce((sum, k) => sum + weights[k] * Math.min(1, Math.max(0, rel[k])), 0) / baseDen : null;
  const alpha = confidence === null ? null : POSTURE_SPEC.emaAlphaMin + (POSTURE_SPEC.emaAlphaMax - POSTURE_SPEC.emaAlphaMin) * confidence;
  // Mirrors resolveCandidateBadState: once candidate-bad, the engine compares against the recovery threshold.
  const enterT = (confidence !== null && confidence < POSTURE_SPEC.lowConfidenceThreshold
    ? POSTURE_SPEC.scoreThresholdBad + POSTURE_SPEC.lowConfidenceBadThresholdBoost
    : POSTURE_SPEC.scoreThresholdBad) * scale;
  const goodT = POSTURE_SPEC.scoreThresholdGood * scale;
  const activeT = state?.candidateBadState ? goodT : enterT;
  return { z, weights, num, den, boost, raw, confidence, alpha, enterT, goodT, activeT };
}

export default function ModelLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PostureEngineState>(createPostureEngineState());
  const judgmentRef = useRef<JudgmentSettings>({ difficulty: "normal", dualMonitor: false });
  const historyRef = useRef<{ raw: (number | null)[]; ema: number[] }>({ raw: [], ema: [] });
  const [frame, setFrame] = useState<Frame | null>(null);
  const [status, setStatus] = useState("カメラとモデルを初期化しています…");
  const [difficulty, setDifficulty] = useState<JudgmentSettings["difficulty"]>("normal");

  useEffect(() => { judgmentRef.current = { difficulty, dualMonitor: false }; }, [difficulty]);

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    let landmarker: PoseLandmarker | null = null;
    let raf = 0;
    let lastUi = 0;
    let lastTs = 0;
    let fps = 0;

    const release = () => {
      cancelAnimationFrame(raf);
      const camera = stream;
      stream = null;
      camera?.getTracks().forEach((track) => track.stop());
      if (videoRef.current?.srcObject === camera) videoRef.current.srcObject = null;
      const model = landmarker;
      landmarker = null;
      model?.close();
    };

    (async () => {
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!alive) { acquired.getTracks().forEach((track) => track.stop()); return; }
        stream = acquired;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        if (!alive) return;
        setStatus("MediaPipe Pose Landmarker を読み込み中…");
        const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
        if (!alive) return;
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (!alive) { release(); return; }
        setStatus("");
        const loop = () => {
          if (!alive) return;
          const now = performance.now();
          try {
            if (video.readyState >= 2 && now - lastTs >= 33) {
              fps = lastTs ? fps * 0.9 + (1000 / (now - lastTs)) * 0.1 : 0;
              lastTs = now;
              const detection = landmarker!.detectForVideo(video, now);
              const lm: NormalizedLandmark[] | null = detection.landmarks[0] ?? null;
              const wl: Landmark[] | null = detection.worldLandmarks[0] ?? null;
              const { state, result } = evaluatePostureFrame(engineRef.current, now, lm, wl, null, judgmentRef.current);
              engineRef.current = state;
              const reliability = result.features
                ? computeFeatureReliability(pickLandmarkSetFromSource(lm, wl, "image"), pickLandmarkSetFromSource(lm, wl, "world"), result.features)
                : null;
              drawOverlay(canvasRef.current, video, lm, result.postureState === "bad", !!state.baseline && result.eval.candidateBad);
              if (now - lastUi >= 80) {
                lastUi = now;
                pushHistory(historyRef.current, state, computeBreakdown(result, state, reliability, judgmentScale(judgmentRef.current)).raw);
                setFrame({ result, state, reliability, landmarks: lm, fps });
              }
            }
          } catch (error) {
            release();
            setStatus(`計測中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (error) {
        if (!alive) return;
        release();
        setStatus(`初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();

    return () => {
      alive = false;
      release();
    };
  }, []);

  const recalibrate = () => {
    engineRef.current = createPostureEngineState();
    historyRef.current = { raw: [], ema: [] };
    setFrame(null);
  };

  const result = frame?.result ?? null;
  const state = frame?.state ?? null;
  const baseline = state?.baseline ?? null;
  const features = result?.features ?? null;
  const scale = judgmentScale({ difficulty, dualMonitor: false });
  const rel = frame?.reliability ?? null;
  const view = result?.eval.view ?? "unknown";
  const { z, weights, num, den, boost, raw, confidence, alpha, goodT, activeT: badT } = computeBreakdown(result, state, rel, scale);
  const ema = state?.emaScore ?? null;
  const calibrating = !baseline;
  const warmupProgress = state ? Math.min(1, state.warmupValidMs / POSTURE_SPEC.warmupMs) : 0;
  const posture = result?.postureState ?? "hold";
  const isBad = !calibrating && posture === "bad";
  const isWarn = !calibrating && !isBad && !!result?.eval.candidateBad;
  const badProgress = Math.min(1, (state?.badAccumMs ?? 0) / POSTURE_SPEC.badDurationMs);
  const worstKey = z ? FEATURE_KEYS.reduce<FeatureKey | null>((best, k) => (z[k] ?? -1) > (best ? z[best] ?? -1 : -1) ? k : best, null) : null;

  return (
    <div className={`ml${isBad ? " is-bad" : ""}${isWarn ? " is-warn" : ""}`}>
      <header className="ml-head">
        <div>
          <span className="ml-tag">TEST</span>
          <h1>姿勢モデル 特徴量抽出ラボ</h1>
          <p>f : 𝐋 ∈ ℝ³³ˣ³ → 𝐱 ∈ ℝ⁶ → 𝐳 → s → ŝ<sub>EMA</sub> → {"{good, bad}"}</p>
        </div>
        <div className="ml-controls">
          <span className="ml-dim">{frame ? `${fmt(frame.fps, 1)} fps · ${view} · ${result?.usingWorldLandmarks ? "3D world" : "2D image"}` : "—"}</span>
          <div className="ml-seg" role="group" aria-label="判定基準">
            {(["easy", "normal", "hard"] as const).map((d) => (
              <button key={d} aria-pressed={difficulty === d} className={difficulty === d ? "on" : ""} onClick={() => setDifficulty(d)}>
                {d === "easy" ? "やさしい" : d === "normal" ? "ふつう" : "きびしい"}
              </button>
            ))}
          </div>
          <button className="ml-btn" onClick={recalibrate}>再キャリブレーション</button>
        </div>
      </header>

      <div className="ml-grid">
        <section className="ml-cam">
          <div className="ml-stage">
            <video ref={videoRef} playsInline muted />
            <canvas ref={canvasRef} />
            <div className="ml-scan" />
            {status && <div className="ml-status">{status}</div>}
            <div className="ml-corner">STAGE 0 · LANDMARKS {frame?.landmarks ? "LOCKED" : "SEARCHING"}</div>
            {(isBad || isWarn) && (
              <div className="ml-alert" role="status">
                <strong>{isBad ? "⚠ POSTURE ALERT" : "DEVIATION DETECTED"}</strong>
                <span className="mono">
                  {worstKey ? `max z: ${FEATURE_META[worstKey].sym} ${FEATURE_META[worstKey].label} = ${fmt(z?.[worstKey], 2)}` : ""}
                </span>
                {isWarn && <div className="ml-alert-bar"><i style={{ width: `${badProgress * 100}%` }} /></div>}
              </div>
            )}
          </div>
          <Pipeline calibrating={calibrating} posture={calibrating ? "calibrating" : posture} />
          <Panel n={5} title="判定 (ヒステリシス)" sub={`m = ${scale},  現在のしきい値 ${fmt(badT, 2)} (bad ${POSTURE_SPEC.badDurationMs / 1000}s / good < ${fmt(goodT, 2)} ${POSTURE_SPEC.recoverDurationMs / 1000}s)  ※頭の左右傾き・複数モニター判定は未入力`}>
            <div className={`ml-verdict ${calibrating ? "hold" : isBad ? "bad" : isWarn ? "warn" : posture}`}>
              <span>{calibrating ? "CALIBRATING" : isBad ? "BAD" : isWarn ? "WARNING" : posture.toUpperCase()}</span>
              {calibrating ? (
                <div className="ml-calib">
                  <div className="ml-bar"><i style={{ width: `${warmupProgress * 100}%` }} /></div>
                  <span className="mono">サンプル収集中 {fmt(state ? state.warmupValidMs / 1000 : 0, 1)} / {POSTURE_SPEC.warmupMs / 1000}s · n = {state?.warmupSamples.neckAngleDeg.length ?? 0}</span>
                  <span className="dim">良い姿勢のまま正面を向いてください</span>
                </div>
              ) : (
                <div className="ml-hold">
                  <i style={{ width: `${badProgress * 100}%` }} />
                  <em className="mono">bad {Math.round(badProgress * 100)}% / {POSTURE_SPEC.badDurationMs / 1000}s</em>
                </div>
              )}
              <small className="mono">
                badAccum {Math.round(state?.badAccumMs ?? 0)}ms · goodAccum {Math.round(state?.goodAccumMs ?? 0)}ms · tracking {result?.trackingStatus ?? "—"}
              </small>
            </div>
          </Panel>
        </section>

        <section className="ml-panels">
          <Panel n={1} title="特徴量ベクトル 𝐱" sub="W = ‖SL − SR‖, t̂ = 体幹軸, ĥ ⊥ t̂">
            <table className="ml-table">
              <thead><tr><th /><th>特徴</th><th>式</th><th className="r">値</th><th className="r">r<sub>k</sub></th></tr></thead>
              <tbody>
                {FEATURE_KEYS.map((key) => (
                  <tr key={key} className={z?.[key] != null && z[key]! >= badT ? "hot" : ""}>
                    <td className="sym">{FEATURE_META[key].sym}</td>
                    <td>{FEATURE_META[key].label}</td>
                    <td className="f">{FEATURE_META[key].formula}</td>
                    <td className="r mono">{features ? `${fmt(features[key])}${FEATURE_META[key].unit}` : "—"}</td>
                    <td className="r mono dim">{rel ? fmt(rel[key], 2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel n={3} title="正規化偏差 𝐳" sub={`z₁…₅ = |xₖ − μ̃ₖ| / scaleₖ, z₆ = max(0, x₆ − μ̃₆) / scale₆, clip[0, ${POSTURE_SPEC.scoreZClamp}] ┃ = 統合スコアのしきい値（参考）`}>
            <div className="ml-zs">
              {FEATURE_KEYS.map((key) => {
                const v = z?.[key] ?? null;
                const pct = v === null ? 0 : Math.min(v, POSTURE_SPEC.scoreZClamp) / POSTURE_SPEC.scoreZClamp;
                return (
                  <div className="ml-z" key={key}>
                    <span className="sym">{FEATURE_META[key].sym}</span>
                    <div className="ml-zbar">
                      <i className={v !== null && v >= badT ? "hot" : ""} style={{ width: `${pct * 100}%` }} />
                      <b style={{ left: `${(badT / POSTURE_SPEC.scoreZClamp) * 100}%` }} />
                    </div>
                    <span className="mono r">{fmt(v, 2)}</span>
                    <span className="mono dim r">w={fmt(weights[key], 3)}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel n={4} title="重み付き統合 → EMA" sub="s = Σw′ₖzₖ / Σw′ₖ + b,  ŝₜ = αs + (1−α)ŝₜ₋₁">
            <div className="ml-eq mono">
              <div>Σw′z = <em>{fmt(num)}</em> / Σw′ = <em>{fmt(den)}</em></div>
              <div>b<sub>headWidth</sub> = <em>{fmt(boost)}</em></div>
              <div>s = <em>{fmt(raw)}</em></div>
              <div>c = <em>{fmt(confidence, 2)}</em> → α = <em>{fmt(alpha, 3)}</em></div>
              <div className="big">ŝ = <em>{fmt(ema, 3)}</em></div>
            </div>
            <Spark raw={historyRef.current.raw} ema={historyRef.current.ema} bad={badT} good={goodT} />
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="ml-panel">
      <div className="ml-ph"><span className="ml-n">{String(n).padStart(2, "0")}</span><div><h2>{title}</h2><p className="mono">{sub}</p></div></div>
      {children}
    </div>
  );
}

function Pipeline({ calibrating, posture }: { calibrating: boolean; posture: string }) {
  const steps = ["Pose 33pt", "𝐱 ∈ ℝ⁶", calibrating ? "μ̃, MAD …" : "μ̃, MAD", "𝐳", "Σ w·z", "EMA", posture];
  return (
    <div className="ml-pipe">
      {steps.map((s, i) => (
        <span key={i} className={calibrating && i >= 2 ? "wait" : i === steps.length - 1 && posture === "bad" ? "alarm" : "live"} style={{ animationDelay: `${i * 0.12}s` }}>{s}</span>
      ))}
    </div>
  );
}

function Spark({ raw, ema, bad, good }: { raw: (number | null)[]; ema: number[]; bad: number; good: number }) {
  const W = 400, H = 90, max = Math.max(3, bad * 1.3);
  const path = (list: (number | null)[]) => {
    let connected = false;
    return list.map((v, i) => {
      if (v === null) { connected = false; return ""; }
      const command = connected ? "L" : "M";
      connected = true;
      return `${command}${(i / (HISTORY - 1)) * W},${H - (Math.min(v, max) / max) * H}`;
    }).join("");
  };
  const y = (v: number) => H - (v / max) * H;
  return (
    <svg className="ml-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="スコア推移">
      <line x1={0} x2={W} y1={y(bad)} y2={y(bad)} className="th-bad" />
      <line x1={0} x2={W} y1={y(good)} y2={y(good)} className="th-good" />
      <path d={path(raw)} className="raw" />
      <path d={path(ema)} className="ema" />
    </svg>
  );
}

function pushHistory(h: { raw: (number | null)[]; ema: number[] }, state: PostureEngineState, raw: number | null) {
  if (!state.baseline || state.emaScore === null) return;
  h.ema.push(state.emaScore);
  h.raw.push(raw);
  if (h.ema.length > HISTORY) { h.ema.shift(); h.raw.shift(); }
}

const SKELETON: [number, number][] = [
  [POSE_LANDMARK_INDEX.LEFT_SHOULDER, POSE_LANDMARK_INDEX.RIGHT_SHOULDER],
  [POSE_LANDMARK_INDEX.LEFT_SHOULDER, POSE_LANDMARK_INDEX.LEFT_HIP],
  [POSE_LANDMARK_INDEX.RIGHT_SHOULDER, POSE_LANDMARK_INDEX.RIGHT_HIP],
  [POSE_LANDMARK_INDEX.LEFT_HIP, POSE_LANDMARK_INDEX.RIGHT_HIP],
  [POSE_LANDMARK_INDEX.LEFT_EAR, POSE_LANDMARK_INDEX.RIGHT_EAR],
];

function drawOverlay(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, lm: NormalizedLandmark[] | null, bad = false, warn = false) {
  if (!canvas) return;
  const w = video.videoWidth, h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const P = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h, v: lm[i].visibility ?? 1 });
  const I = POSE_LANDMARK_INDEX;
  const N = P(I.NOSE), EL = P(I.LEFT_EAR), ER = P(I.RIGHT_EAR), SL = P(I.LEFT_SHOULDER), SR = P(I.RIGHT_SHOULDER), HL = P(I.LEFT_HIP), HR = P(I.RIGHT_HIP);
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const EM = mid(EL, ER), SM = mid(SL, SR), HM = mid(HL, HR);
  const unit = Math.max(2, w / 640);

  ctx.lineWidth = unit;
  const accent = bad ? "rgba(255, 77, 109, 0.9)" : warn ? "rgba(255, 179, 71, 0.8)" : "rgba(120, 220, 255, 0.45)";
  ctx.strokeStyle = accent;
  ctx.setLineDash([4 * unit, 4 * unit]);
  for (const [a, b] of SKELETON) { const pa = P(a), pb = P(b); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); }
  ctx.setLineDash([]);

  const arrow = (from: { x: number; y: number }, to: { x: number; y: number }, color: string, label: string) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = unit * 1.6;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    const a = Math.atan2(to.y - from.y, to.x - from.x), s = 7 * unit;
    ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - s * Math.cos(a - 0.4), to.y - s * Math.sin(a - 0.4)); ctx.lineTo(to.x - s * Math.cos(a + 0.4), to.y - s * Math.sin(a + 0.4)); ctx.fill();
    drawLabel(ctx, label, (from.x + to.x) / 2, (from.y + to.y) / 2, color, unit);
  };
  const hipsOk = HL.v > 0.5 && HR.v > 0.5;
  arrow(hipsOk ? HM : { x: SM.x, y: SM.y + h * 0.25 }, SM, bad ? "#ff4d6d" : "#ffd166", "t̂");
  arrow(SM, EM, bad ? "#ff4d6d" : warn ? "#ffb347" : "#7cf2c4", "EM−SM");
  arrow(EM, N, bad ? "#ff4d6d" : "#ff7aa8", "N−EM");

  for (const [p, name] of [[N, "N"], [EL, "EL"], [ER, "ER"], [SL, "SL"], [SR, "SR"], [EM, "EM"], [SM, "SM"]] as const) {
    ctx.fillStyle = "#e9fbff";
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * unit, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = unit;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7 * unit, 0, Math.PI * 2); ctx.stroke();
    drawLabel(ctx, name, p.x + 10 * unit, p.y - 10 * unit, "#bdefff", unit);
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, unit: number) {
  // Canvas is mirrored with CSS; flip text back so it stays readable.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.font = `${11 * unit}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
