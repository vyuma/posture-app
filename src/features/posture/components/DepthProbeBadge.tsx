import type { DepthProbeSnapshot } from "../depth/depthProbe.types";

const STATUS_LABEL: Record<DepthProbeSnapshot["status"], string> = {
  off: "停止",
  loading: "モデル読み込み中",
  ready: "動作中",
  error: "エラー",
};

function format(value: number | null, digits = 3) {
  return value === null ? "-" : value.toFixed(digits);
}

/** 深度プローブの検証用表示。`?depth=1` のときだけ出す。 */
export function DepthProbeBadge({ depth }: { depth: DepthProbeSnapshot }) {
  if (depth.status === "off") {
    return null;
  }

  return (
    <aside
      aria-label="深度プローブ"
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 1000,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(0, 0, 0, 0.72)",
        color: "#fff",
        font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        pointerEvents: "none",
      }}
    >
      <div>
        深度: {STATUS_LABEL[depth.status]}
        {depth.backend ? ` · ${depth.backend} · ${depth.model}` : ""}
      </div>
      <div>推論: {depth.inferenceMs === null ? "-" : `${Math.round(depth.inferenceMs)}ms`}</div>
      <div>耳−肩 視差: {format(depth.earShoulderDelta)}</div>
      <div>正規化: {format(depth.normalizedDelta)}</div>
      <div>
        基準から: {depth.baselineReady ? format(depth.deltaFromBaseline) : "基準を学習中"}
      </div>
      {depth.message ? <div>{depth.message}</div> : null}
    </aside>
  );
}
