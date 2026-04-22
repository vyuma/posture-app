import { useEffect, useState } from "react";

import { usePairingState } from "../hooks/usePairingState";
import { buildPairingLink, buildPairingQrImageUrl } from "../services/pairingLink";
import "./PairingDialog.css";

type PairingDialogProps = {
  onClose: () => void;
};

export function PairingDialog({ onClose }: PairingDialogProps) {
  const { pairingInfo, status, isLoading, error, refresh } = usePairingState();
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");

  const pairingLink = buildPairingLink(pairingInfo);
  const qrImageUrl = buildPairingQrImageUrl(pairingLink);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    // フィードバック表示を一定時間後に自動でクリアする。
    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  async function copyLink() {
    if (!pairingLink) {
      return;
    }

    setCopyState("idle");

    try {
      await navigator.clipboard.writeText(pairingLink);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="pairing-overlay" onClick={onClose} role="presentation">
      <section
        className="pairing-dialog"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-label="モバイルペアリング"
      >
        <div className="pairing-dialog-header">
          <div>
            <p className="pairing-eyebrow">モバイル連携</p>
            <h2>ペアリングQR</h2>
          </div>
          <button type="button" className="pairing-close" onClick={onClose}>
            閉じる
          </button>
        </div>

        <p className="pairing-description">
          モバイルアプリでQRコードを読み取るか、下のアドレスを開くとすぐに接続を始められます。
        </p>

        <div className="pairing-dialog-body">
          <div className="pairing-qr-card">
            {qrImageUrl ? (
              <img
                className="pairing-qr-image"
                src={qrImageUrl}
                alt="ペアリングQRコード"
              />
            ) : (
              <div className="pairing-qr-placeholder">ペアリング情報を読み込み中...</div>
            )}
          </div>

          <div className="pairing-info">
            <div className="pairing-status-row">
              <span>接続状態</span>
              <strong>
                {isLoading ? "読み込み中..." : status?.paired ? "接続済み" : "待機中"}
              </strong>
            </div>
            <div className="pairing-status-row">
              <span>接続端末</span>
              <strong>{status?.deviceName ?? "-"}</strong>
            </div>
            <div className="pairing-status-row">
              <span>最終受信</span>
              <strong>{status?.lastSeenAt ?? "-"}</strong>
            </div>

            <label className="pairing-field" htmlFor="pairing-link">
              <span>ペアリングアドレス</span>
              <textarea
                id="pairing-link"
                readOnly
                rows={4}
                value={pairingLink}
              />
            </label>

            <div className="pairing-actions">
              <button type="button" onClick={refresh}>
                更新
              </button>
              <button type="button" onClick={() => void copyLink()} disabled={!pairingLink}>
                アドレスをコピー
              </button>
            </div>

            {copyState === "done" ? (
              <p className="pairing-hint pairing-ok">ペアリングアドレスをコピーしました。</p>
            ) : null}
            {copyState === "error" ? (
              <p className="pairing-hint pairing-error">クリップボードへのコピーに失敗しました。</p>
            ) : null}
            {error ? <p className="pairing-hint pairing-error">{error}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
