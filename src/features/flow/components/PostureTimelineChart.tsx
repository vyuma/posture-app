import type { ReactElement } from "react";

import type { PostureTimelineSegment } from "../types";

type PostureTimelineChartProps = {
  segments: PostureTimelineSegment[];
  /** 累積の activeMeasurementMs と同一 */
  totalMs: number;
  variant?: "success" | "fail";
  className?: string;
  /**
   * 共有キャプチャ等で CSS 変数が効かない環境向け：良い線の色を HEX 等で直接指定。
   * 未指定時は従来どおり var(--result-timeline-good, …) を使用。
   */
  resolvedGoodStroke?: string;
  /** 悪い線色（省略時は固定のグレー系） */
  resolvedBadStroke?: string;
};

const VIEWBOX_W = 360;
const VIEWBOX_H = 92;
/** グラフ描画 inner */
const TRACK_X = 12;
const TRACK_Y = 18;
const TRACK_W = VIEWBOX_W - TRACK_X * 2;
const TRACK_H = 52;

function msToX(ms: number, totalMs: number): number {
  const denom = Math.max(totalMs, 1);
  return (
    TRACK_X + Math.max(0, Math.min(TRACK_W, (ms / denom) * TRACK_W))
  );
}

export function PostureTimelineChart({
  segments,
  totalMs,
  variant = "success",
  className,
  resolvedGoodStroke,
  resolvedBadStroke,
}: PostureTimelineChartProps) {
  const safeTotal = Number.isFinite(totalMs) ? Math.max(0, totalMs) : 0;
  const hasData = segments.length > 0 && safeTotal > 0;
  const summaryLabel =
    segments.length > 0 && safeTotal > 0
      ? `区間${segments.length}本・累計${Math.round(safeTotal / 1000)}秒`
      : "データなし";

  /** SVG：上＝良い(1)、下＝悪い・hold(0)。Y軸は一般的な 1/0 と一致 */
  const yOne = TRACK_Y + 12;
  const yZero = TRACK_Y + TRACK_H - 12;
  const strokeW = 3.2;
  const goodStroke =
    resolvedGoodStroke !== undefined
      ? resolvedGoodStroke
      : variant === "success"
        ? "var(--result-timeline-good, #fd8c3e)"
        : "var(--result-timeline-good, #13a2d7)";
  const badStroke = resolvedBadStroke ?? "#9aa7b5";
  const connectorStroke = "rgba(72, 86, 98, 0.35)";

  const steps: ReactElement[] = [];

  if (hasData) {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      let xStart = msToX(segment.startMs, safeTotal);
      const xEnd = msToX(segment.endMs, safeTotal);
      if (xEnd - xStart < 1.5) {
        xStart = Math.max(TRACK_X, xEnd - 1.8);
      }
      const y = segment.isGood ? yOne : yZero;
      const lineClass =
        segment.isGood
          ? "result-posture-timeline-line is-good"
          : "result-posture-timeline-line is-bad";
      const strokeColor = segment.isGood ? goodStroke : badStroke;

      steps.push(
        <line
          key={`h-${segment.startMs}-${segment.endMs}-${segment.isGood}`}
          className={lineClass}
          x1={xStart}
          y1={y}
          x2={xEnd}
          y2={y}
          strokeWidth={strokeW}
          strokeLinecap="round"
          stroke={strokeColor}
        />,
      );

      const prevSeg = segments[i - 1];
      if (
        prevSeg !== undefined &&
        prevSeg.isGood !== segment.isGood &&
        Math.abs(segment.startMs - prevSeg.endMs) <= 2
      ) {
        const xv = msToX(segment.startMs, safeTotal);
        const yFrom = prevSeg.isGood ? yOne : yZero;
        steps.push(
          <line
            key={`v-${segment.startMs}-${i}`}
            className="result-posture-timeline-connector"
            x1={xv}
            y1={yFrom}
            x2={xv}
            y2={segment.isGood ? yOne : yZero}
            strokeWidth={strokeW * 0.55}
            stroke={connectorStroke}
          />,
        );
      }
    }
  }

  return (
    <figure
      className={[
        "result-posture-timeline",
        variant === "success"
          ? "result-posture-timeline--success"
          : "result-posture-timeline--fail",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="result-posture-timeline-axis" aria-hidden="true">
        <span className="result-posture-timeline-y-label">1 · 良い</span>
        <span className="result-posture-timeline-y-label">0 · 悪い</span>
      </div>
      <svg
        className="result-posture-timeline-svg"
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        width={VIEWBOX_W}
        height={VIEWBOX_H}
        style={{ width: "100%", height: "auto" }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`姿勢タイムライン（ステップ線）。${summaryLabel}。横軸は測定時間、縦軸は良い姿勢を1（上）・そうでないを0（下）。`}
      >
        <rect
          x={TRACK_X}
          y={TRACK_Y}
          width={TRACK_W}
          height={TRACK_H}
          rx={10}
          className="result-posture-timeline-track-bg"
          fill="#f6f7f9"
          stroke="rgba(0,0,0,0.06)"
        />

        {/* ガイドライン（二分レーンの境目・薄線） */}
        <line
          className="result-posture-timeline-lane-split"
          x1={TRACK_X + 2}
          y1={(yOne + yZero) / 2}
          x2={TRACK_X + TRACK_W - 2}
          y2={(yOne + yZero) / 2}
        />

        {hasData ? steps : null}

        {!hasData ? (
          <text
            x={TRACK_X + TRACK_W / 2}
            y={TRACK_Y + TRACK_H / 2}
            className="result-posture-timeline-empty-text"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            データなし
          </text>
        ) : null}
      </svg>
    </figure>
  );
}
