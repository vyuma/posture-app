import { POSTURE_SPEC } from "../engine";
import type { RuntimeSnapshot } from "../types";

type PostureControlPanelProps = {
  snapshot: RuntimeSnapshot;
  onReset: () => void;
};

export function PostureControlPanel({
  snapshot,
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
        <span>bad候補: {snapshot.candidateBad ? "YES" : "NO"}</span>
        <span>yawゲート: {snapshot.yawGate}</span>
        <span>yaw指標: {snapshot.yawProxy.toFixed(3)}</span>
        <span>head係数: {snapshot.headScale.toFixed(2)}</span>
        <span>baseline: {snapshot.baselineReady ? "READY" : "WARMUP"}</span>
        <span>warmup残り時間: {Math.ceil(snapshot.warmupRemainingMs / 1000)}s</span>
        <span>
          座標ソース: {snapshot.usingWorldLandmarks ? "world優先" : "image fallback"}
        </span>
      </div>

      <div className="criterion-meta" style={{ marginTop: 10 }}>
        <span>f1: {snapshot.features ? snapshot.features.f1.toFixed(4) : "-"}</span>
        <span>f2: {snapshot.features ? snapshot.features.f2.toFixed(4) : "-"}</span>
        <span>f3: {snapshot.features ? snapshot.features.f3.toFixed(4) : "-"}</span>
        <span>f4: {snapshot.features ? snapshot.features.f4.toFixed(4) : "-"}</span>
        <span>f5: {snapshot.features ? snapshot.features.f5.toFixed(4) : "-"}</span>
      </div>
    </aside>
  );
}
