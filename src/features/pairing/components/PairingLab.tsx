import { useState } from "react";

import { usePairingState, type VibrationPattern } from "..";

export function PairingLab() {
  const { pairingInfo, status, isLoading, error, refresh, sendVibration } =
    usePairingState();
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");

  const pairingLink = pairingInfo
    ? `vibeapp://pair?host=${pairingInfo.host}&port=${pairingInfo.port}&token=${pairingInfo.token}`
    : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pairingLink);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
  }

  async function handleSend(pattern: VibrationPattern) {
    await sendVibration(pattern);
  }

  return (
    <>
      <section className="panel">
        <p className="eyebrow">デスクトップ連携</p>
        <h2>ペアリング情報</h2>
        <p className="subtle">
          QRコードの代わりに、下のリンクをモバイル側へ貼り付けてもすぐ試せます。
        </p>

        <div className="field">
          <span className="label">ホスト</span>
          <code>{pairingInfo?.host ?? "読み込み中..."}</code>
        </div>
        <div className="field">
          <span className="label">ポート</span>
          <code>{pairingInfo?.port ?? "-"}</code>
        </div>
        <div className="field">
          <span className="label">トークン</span>
          <code>{pairingInfo?.token ?? "-"}</code>
        </div>
        <div className="field field-column">
          <span className="label">ペアリングリンク</span>
          <textarea className="link-box" readOnly value={pairingLink} />
        </div>

        <div className="actions">
          <button onClick={refresh} type="button">
            更新
          </button>
          <button onClick={copyLink} disabled={!pairingLink} type="button">
            リンクをコピー
          </button>
        </div>

        {copyState === "done" ? <p className="hint ok">リンクをコピーしました。</p> : null}
        {copyState === "error" ? (
          <p className="hint error">クリップボードへのコピーに失敗しました。</p>
        ) : null}
        {error ? <p className="hint error">{error}</p> : null}
      </section>

      <section className="panel">
        <p className="eyebrow">接続状態</p>
        <div className="status-grid">
          <div className="status-card">
            <span className="label">接続済み</span>
            <strong>{isLoading ? "読み込み中..." : status?.paired ? "はい" : "いいえ"}</strong>
          </div>
          <div className="status-card">
            <span className="label">端末名</span>
            <strong>{status?.deviceName ?? "-"}</strong>
          </div>
          <div className="status-card">
            <span className="label">最終受信</span>
            <strong>{status?.lastSeenAt ?? "-"}</strong>
          </div>
          <div className="status-card">
            <span className="label">シーケンス</span>
            <strong>{status?.lastSequence ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">振動テスト</p>
        <div className="actions">
          <button onClick={() => void handleSend("short")} type="button">
            短く送信
          </button>
          <button onClick={() => void handleSend("double")} type="button">
            2回送信
          </button>
          <button onClick={() => void handleSend("long")} type="button">
            長く送信
          </button>
        </div>
      </section>
    </>
  );
}
