import { useEffect, useRef, useState } from "react";

import { usePairingState } from "../hooks/usePairingState";
import { emitPostureSignal } from "../services/desktopBridge";
import { buildPairingLink } from "../services/pairingLink";
import { generateQrDataUrl } from "../../../lib/qrcode";
import "./PairingDialog.css";

type PairingDialogProps = {
  onClose: () => void;
};

export function PairingDialog({ onClose }: PairingDialogProps) {
  const { pairingInfo, status, isLoading, error, refresh } = usePairingState();
  // コピーボタンのフィードバック状態
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  // バイブテストの動作状態（idle=未送信, running=連続送信中, error=エラー発生）
  const [vibeState, setVibeState] = useState<"idle" | "running" | "error">("idle");
  const [qrImageUrl, setQrImageUrl] = useState("");
  // バイブ連続送信用のインターバルIDを保持するref
  const vibeIntervalRef = useRef<number | null>(null);

  const pairingLink = buildPairingLink(pairingInfo);

  // Escapeキーでダイアログを閉じるキーボードハンドラ
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // コピー状態のフィードバック表示を一定時間後に自動クリアする
  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  // コンポーネントアンマウント時にバイブ連続送信を停止する
  useEffect(() => {
    return () => {
      if (vibeIntervalRef.current !== null) {
        window.clearInterval(vibeIntervalRef.current);
        vibeIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!pairingLink) {
      setQrImageUrl("");
      return () => {
        active = false;
      };
    }

    void generateQrDataUrl(pairingLink)
      .then((dataUrl) => {
        if (active) {
          setQrImageUrl(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setQrImageUrl("");
        }
      });

    return () => {
      active = false;
    };
  }, [pairingLink]);

  // ペアリングアドレスをクリップボードにコピーする
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

  // バイブテストを開始する（初回送信 + 連続送信を開始）
  async function startVibeTest() {
    // まず初回の送信を試みる
    try {
      await emitPostureSignal(true);
    } catch {
      setVibeState("error");
      return;
    }

    // 初回成功したら連続送信状態に移行
    setVibeState("running");

    // 1秒ごとにバイブ信号を連続送信する
    vibeIntervalRef.current = window.setInterval(async () => {
      try {
        await emitPostureSignal(true);
      } catch {
        // 送信失敗時は自動停止する
        stopVibeTest();
        setVibeState("error");
      }
    }, 1000);
  }

  // バイブテストを停止する
  function stopVibeTest() {
    if (vibeIntervalRef.current !== null) {
      window.clearInterval(vibeIntervalRef.current);
      vibeIntervalRef.current = null;
    }

    // 停止後に「姿勢良好」シグナルを送信してスマホ側のバイブを止める
    void emitPostureSignal(false).catch(() => {
      // 停止シグナル送信失敗は無視する
    });

    setVibeState("idle");
  }

  // バイブテストボタンの押下ハンドラ（トグル動作）
  function handleVibeToggle() {
    if (vibeState === "running") {
      stopVibeTest();
    } else {
      void startVibeTest();
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

            {/* アクションボタン行：更新 / アドレスをコピー / バイブテスト(トグル) */}
            <div className="pairing-actions">
              <button type="button" onClick={refresh}>
                更新
              </button>
              <button type="button" onClick={() => void copyLink()} disabled={!pairingLink}>
                アドレスをコピー
              </button>
              <button
                type="button"
                className={vibeState === "running" ? "pairing-vibe-stop" : "pairing-vibe-test"}
                onClick={handleVibeToggle}
              >
                {vibeState === "running" ? "停止" : "バイブテスト"}
              </button>
            </div>

            {/* コピー結果のフィードバック */}
            {copyState === "done" ? (
              <p className="pairing-hint pairing-ok">ペアリングアドレスをコピーしました。</p>
            ) : null}
            {copyState === "error" ? (
              <p className="pairing-hint pairing-error">クリップボードへのコピーに失敗しました。</p>
            ) : null}
            {/* バイブテスト結果のフィードバック */}
            {vibeState === "error" ? (
              <p className="pairing-hint pairing-error">バイブテスト送信に失敗しました。スマホが接続されているか確認してください。</p>
            ) : null}
            {error ? <p className="pairing-hint pairing-error">{error}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
