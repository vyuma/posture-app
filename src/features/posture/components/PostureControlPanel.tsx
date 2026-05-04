import { POSTURE_SPEC } from "../engine";
import type { PostureExperimentMetrics } from "../engine";
import type { PostureExperimentSample, RuntimeSnapshot } from "../types";

type PostureControlPanelProps = {
  snapshot: RuntimeSnapshot;
  experimentHistory: PostureExperimentSample[];
  onReset: () => void;
};

const CHART_WINDOW_MS = 20_000;
const CHART_WIDTH = 240;
const CHART_HEIGHT = 92;
const CHART_PADDING = 10;

type ExperimentProxy = NonNullable<PostureExperimentMetrics["proxy"]>;
type ExperimentProxyPoint = ExperimentProxy["nose"];

export function PostureControlPanel({
  snapshot,
  experimentHistory,
  onReset,
}: PostureControlPanelProps) {
  return (
    <aside className="control-panel">
      <h2>姿勢エンジン</h2>
      <p className="panel-note">
        ウォームアップ {POSTURE_SPEC.warmupMs / 1000}s · Bad確定 {POSTURE_SPEC.badDurationMs / 1000}s · 回復 {POSTURE_SPEC.recoverDurationMs / 1000}s
      </p>

      <button type="button" onClick={onReset}>
        測定基準を再学習
      </button>

      <div className="criterion-meta" style={{ marginTop: 10 }}>
        <span>状態: {snapshot.postureState}</span>
        <span>品質: {snapshot.qualityOk ? "OK" : "HOLD"}</span>
        <span>視点: {snapshot.view}</span>
        <span>スコア: {snapshot.score.toFixed(3)}</span>
        <span>首の回転(HeadTurn): {snapshot.isHeadTurned ? "YES" : "NO"}</span>
        <span>
          首の回転比率(Yaw Ratio): {snapshot.headYawRatio != null ? snapshot.headYawRatio.toFixed(3) : "-"}
        </span>
        <span>bad候補: {snapshot.candidateBad ? "YES" : "NO"}</span>
        <span>baseline: {snapshot.baselineReady ? "READY" : "WARMUP"}</span>
        <span>warmup残り時間: {Math.ceil(snapshot.warmupRemainingMs / 1000)}s</span>
        <span>
          座標ソース: {snapshot.usingWorldLandmarks ? "world優先" : "image fallback"}
        </span>
        <span>
          追跡モード:{" "}
          {snapshot.trackingMode === "background"
            ? "BACKGROUND"
            : "FOREGROUND"}
        </span>
        <span>推論周期: {snapshot.trackingIntervalMs}ms</span>
      </div>

      <div className="criterion-meta" style={{ marginTop: 10 }}>
        <span>
          頭の左右ずれ:{" "}
          {formatFeature(snapshot.features?.headLateralOffsetRatio, 4)}
        </span>
        <span>
          耳-肩距離:{" "}
          {formatFeature(snapshot.features?.earShoulderDistanceRatio, 4)}
        </span>
        <span>
          体幹傾き: {formatFeature(snapshot.features?.torsoTiltDeg, 2, "deg")}
        </span>
        <span>
          首角度: {formatFeature(snapshot.features?.neckAngleDeg, 2, "deg")}
        </span>
        <span>
          耳-肩左右差:{" "}
          {formatFeature(snapshot.features?.earShoulderAsymmetryRatio, 4)}
        </span>
        <span>
          頭部前傾角:{" "}
          {formatFeature(snapshot.features?.headForwardAngleDeg, 2, "deg")}
        </span>
        <span>
          頭幅比(耳/肩):{" "}
          {snapshot.headWidthRatio !== null
            ? snapshot.headWidthRatio.toFixed(4)
            : "-"}
        </span>
        <span>
          頭幅倍率:{" "}
          {snapshot.headWidthScale !== null
            ? `${snapshot.headWidthScale.toFixed(3)}x`
            : "-"}
        </span>
        <span>頭幅加点: +{snapshot.headWidthScoreBoost.toFixed(3)}</span>
      </div>

      <section className="experiment-section" aria-label="Neck Angle Signal">
        <div className="experiment-heading">
          <h3>Neck Angle Signal</h3>
        </div>

        <div className="experiment-metrics">
          <span>
            3D首角度: {formatMetric(snapshot.experiment.neckAngle3d, 2, "deg")}
          </span>
          <span>
            2D fallback:{" "}
            {formatMetric(snapshot.experiment.neckAngle2dFallback, 2, "deg")}
          </span>
          <span>
            頭部前傾角:{" "}
            {formatMetric(snapshot.experiment.headForwardAngleDeg, 2, "deg")}
          </span>
          <span>
            sourceQuality: {formatSourceQuality(snapshot.experiment.sourceQuality)}
          </span>
          <span>samples: {experimentHistory.length}</span>
        </div>

        <ExperimentChart samples={experimentHistory} />
        <SideViewProxy experiment={snapshot.experiment} />
      </section>
    </aside>
  );
}

function formatFeature(
  value: number | null | undefined,
  digits: number,
  suffix = "",
) {
  if (value === undefined || value === null) {
    return "-";
  }

  return suffix ? `${value.toFixed(digits)} ${suffix}` : value.toFixed(digits);
}

function formatMetric(value: number | null, digits: number, suffix = "") {
  if (value === null) {
    return "-";
  }

  return suffix ? `${value.toFixed(digits)} ${suffix}` : value.toFixed(digits);
}

function formatSourceQuality(
  sourceQuality: PostureExperimentMetrics["sourceQuality"],
) {
  switch (sourceQuality) {
    case "world":
      return "world";
    case "missing-hips":
      return "world/no hips";
    case "vertical-fallback":
      return "world/vertical axis";
    case "mixed":
      return "mixed";
    case "image":
      return "image fallback";
    case "insufficient":
      return "insufficient";
  }
}

function ExperimentChart({ samples }: { samples: PostureExperimentSample[] }) {
  const latestTs = samples[samples.length - 1]?.timestampMs ?? 0;
  const visibleSamples = samples.filter(
    (sample) => sample.timestampMs >= latestTs - CHART_WINDOW_MS,
  );
  const angleValues = visibleSamples.flatMap((sample) =>
    [sample.neckAngle2dFallback, sample.neckAngle3d].filter(
      (value): value is number => value !== null,
    ),
  );
  const maxAngle = Math.max(20, ...angleValues, 0);
  const minTs = visibleSamples[0]?.timestampMs ?? latestTs;
  const maxTs = latestTs > minTs ? latestTs : minTs + 1;
  const neckAngle2dPoints = buildChartPoints(
    visibleSamples,
    "neckAngle2dFallback",
    minTs,
    maxTs,
    maxAngle,
  );
  const neckAngle3dPoints = buildChartPoints(
    visibleSamples,
    "neckAngle3d",
    minTs,
    maxTs,
    maxAngle,
  );

  return (
    <div className="experiment-chart" aria-label="Neck angle chart">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img">
        <line
          className="experiment-chart-axis"
          x1={CHART_PADDING}
          y1={CHART_HEIGHT - CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
          y2={CHART_HEIGHT - CHART_PADDING}
        />
        <line
          className="experiment-chart-axis"
          x1={CHART_PADDING}
          y1={CHART_PADDING}
          x2={CHART_PADDING}
          y2={CHART_HEIGHT - CHART_PADDING}
        />
        {neckAngle2dPoints.length > 0 ? (
          <polyline
            className="experiment-line experiment-line-2d"
            points={neckAngle2dPoints}
          />
        ) : null}
        {neckAngle3dPoints.length > 0 ? (
          <polyline
            className="experiment-line experiment-line-3d"
            points={neckAngle3dPoints}
          />
        ) : null}
      </svg>
      <div className="experiment-legend">
        <span className="experiment-key experiment-key-3d">3D</span>
        <span className="experiment-key experiment-key-2d">2D fallback</span>
      </div>
    </div>
  );
}

function buildChartPoints(
  samples: PostureExperimentSample[],
  key: "neckAngle2dFallback" | "neckAngle3d",
  minTs: number,
  maxTs: number,
  maxAngle: number,
) {
  const width = CHART_WIDTH - CHART_PADDING * 2;
  const height = CHART_HEIGHT - CHART_PADDING * 2;

  return samples
    .filter((sample) => sample[key] !== null)
    .map((sample) => {
      const value = sample[key] as number;
      const x = CHART_PADDING + ((sample.timestampMs - minTs) / (maxTs - minTs)) * width;
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        (Math.min(value, maxAngle) / maxAngle) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function SideViewProxy({
  experiment,
}: {
  experiment: PostureExperimentMetrics;
}) {
  const proxy = experiment.proxy;
  if (!proxy) {
    return <div className="side-proxy side-proxy-empty">World Z unavailable</div>;
  }

  const availablePoints = [
    proxy.nose,
    proxy.earMidpoint,
    proxy.shoulderMidpoint,
    proxy.hipMidpoint,
  ].filter((point): point is ExperimentProxyPoint => point !== null);
  const yValues = availablePoints.map((point) => point.y);
  const zValues = availablePoints.map((point) => point.z);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);
  const yPadding = Math.max((yMax - yMin) * 0.2, 0.04);
  const zPadding = Math.max((zMax - zMin) * 0.2, 0.04);
  const project = (point: ExperimentProxyPoint) => {
    const x =
      18 +
      ((point.z - (zMin - zPadding)) /
        Math.max(0.001, zMax - zMin + zPadding * 2)) *
        124;
    const y =
      12 +
      ((point.y - (yMin - yPadding)) /
        Math.max(0.001, yMax - yMin + yPadding * 2)) *
        96;
    return { x, y };
  };

  const nose = project(proxy.nose);
  const ear = project(proxy.earMidpoint);
  const shoulder = project(proxy.shoulderMidpoint);
  const hip = proxy.hipMidpoint ? project(proxy.hipMidpoint) : null;
  const torsoReference = hip
    ? extendPoint(
        ear,
        normalizeVector({
          x: shoulder.x - hip.x,
          y: shoulder.y - hip.y,
        }),
        34,
      )
    : experiment.sourceQuality === "vertical-fallback"
      ? { x: ear.x, y: ear.y - 34 }
      : null;
  const anglePath = torsoReference
    ? describeAngleWedge(
        ear,
        Math.atan2(torsoReference.y - ear.y, torsoReference.x - ear.x),
        Math.atan2(nose.y - ear.y, nose.x - ear.x),
        18,
      )
    : null;
  const headForwardReference = { x: shoulder.x, y: shoulder.y - 34 };
  const headForwardAnglePath = describeAngleWedge(
    shoulder,
    Math.atan2(
      headForwardReference.y - shoulder.y,
      headForwardReference.x - shoulder.x,
    ),
    Math.atan2(ear.y - shoulder.y, ear.x - shoulder.x),
    16,
  );

  return (
    <div className="side-proxy" aria-label="Side-view proxy">
      <svg viewBox="0 0 160 120" role="img">
        {anglePath ? <path className="side-proxy-angle" d={anglePath} /> : null}
        <path className="side-proxy-head-forward-angle" d={headForwardAnglePath} />
        <line
          className="side-proxy-head-forward-reference"
          x1={shoulder.x}
          y1={shoulder.y}
          x2={headForwardReference.x}
          y2={headForwardReference.y}
        />
        {torsoReference ? (
          <line
            className="side-proxy-reference"
            x1={ear.x}
            y1={ear.y}
            x2={torsoReference.x}
            y2={torsoReference.y}
          />
        ) : null}
        {hip ? (
          <line
            className="side-proxy-bone"
            x1={hip.x}
            y1={hip.y}
            x2={shoulder.x}
            y2={shoulder.y}
          />
        ) : null}
        <line
          className="side-proxy-bone side-proxy-neck-alignment"
          x1={shoulder.x}
          y1={shoulder.y}
          x2={ear.x}
          y2={ear.y}
        />
        <line
          className="side-proxy-bone side-proxy-neck"
          x1={ear.x}
          y1={ear.y}
          x2={nose.x}
          y2={nose.y}
        />
        {hip ? <circle className="side-proxy-hip" cx={hip.x} cy={hip.y} r="4" /> : null}
        <circle className="side-proxy-shoulder" cx={shoulder.x} cy={shoulder.y} r="5" />
        <circle className="side-proxy-ear" cx={ear.x} cy={ear.y} r="4" />
        <circle className="side-proxy-nose" cx={nose.x} cy={nose.y} r="5" />
      </svg>
    </div>
  );
}

function normalizeVector(vector: { x: number; y: number }) {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < 1e-6) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function extendPoint(
  origin: { x: number; y: number },
  unit: { x: number; y: number } | null,
  length: number,
) {
  if (!unit) {
    return null;
  }

  return {
    x: origin.x + unit.x * length,
    y: origin.y + unit.y * length,
  };
}

function describeAngleWedge(
  center: { x: number; y: number },
  startAngle: number,
  endAngle: number,
  radius: number,
) {
  const delta = normalizeAngle(endAngle - startAngle);
  const arcEnd = startAngle + delta;
  const start = {
    x: center.x + Math.cos(startAngle) * radius,
    y: center.y + Math.sin(startAngle) * radius,
  };
  const end = {
    x: center.x + Math.cos(arcEnd) * radius,
    y: center.y + Math.sin(arcEnd) * radius,
  };
  const sweepFlag = delta >= 0 ? 1 : 0;

  return [
    `M ${center.x.toFixed(2)} ${center.y.toFixed(2)}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${radius} ${radius} 0 0 ${sweepFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function normalizeAngle(angle: number) {
  let next = angle;
  while (next > Math.PI) {
    next -= Math.PI * 2;
  }
  while (next < -Math.PI) {
    next += Math.PI * 2;
  }
  return next;
}
