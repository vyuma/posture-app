import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FlowBrand } from "../../flow/components/shared/FlowBrand";
import type { RemotePairingConfig } from "./parseRemotePairingSearch";

/** ローカル LAN のペアリング TCP サーバーは TLS 未対応のため ws のみ */
function buildPairingWsUrl(config: RemotePairingConfig): string {
  const params = new URLSearchParams({ token: config.token });
  return `ws://${config.host}:${config.port}/ws?${params.toString()}`;
}

/** サーバーが送る状態イベント（camelCase） */
type PairingWsEnvelope = {
  type: string;
  paired?: boolean;
  measuringSessionActive?: boolean;
  goodPostureRegistrationActive?: boolean;
};

type RemoteMirrorPhase = "home" | "postureRegister" | "measuring";

function derivePhase(message: PairingWsEnvelope): RemoteMirrorPhase {
  if (message.paired !== true) {
    return "home";
  }
  if (
    message.measuringSessionActive === true ||
    message.type === "measuring_started"
  ) {
    return "measuring";
  }
  if (
    message.goodPostureRegistrationActive === true ||
    message.type === "good_posture_registration_started"
  ) {
    return "postureRegister";
  }
  return "home";
}

function normalizeMessage(raw: unknown): PairingWsEnvelope | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "";
  if (!type) {
    return null;
  }
  return {
    type,
    paired: typeof o.paired === "boolean" ? o.paired : undefined,
    measuringSessionActive:
      typeof o.measuringSessionActive === "boolean"
        ? o.measuringSessionActive
        : undefined,
    goodPostureRegistrationActive:
      typeof o.goodPostureRegistrationActive === "boolean"
        ? o.goodPostureRegistrationActive
        : undefined,
  };
}

type Props = {
  config: RemotePairingConfig;
};

export function RemotePairingApp({ config }: Props) {
  const [phase, setPhase] = useState<RemoteMirrorPhase>("home");
  const [connection, setConnection] = useState<
    "connecting" | "open" | "error" | "closed"
  >("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const wsUrl = useMemo(() => buildPairingWsUrl(config), [config]);

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const applyMessage = useCallback((data: string) => {
    try {
      const parsed: unknown = JSON.parse(data);
      const envelope = normalizeMessage(parsed);
      if (envelope === null) {
        return;
      }
      setPhase(derivePhase(envelope));
    } catch {
      // 無視（不正 JSON）
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const openSocket = () => {
      clearReconnect();
      wsRef.current?.close();
      if (disposed) {
        return;
      }
      setConnection("connecting");
      setLastError(null);

      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (e) {
        if (!disposed) {
          setConnection("error");
          setLastError(
            e instanceof Error ? e.message : "WebSocket を開けませんでした。",
          );
        }
        return;
      }

      wsRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed) {
          return;
        }
        attemptRef.current = 0;
        setConnection("open");
      });

      socket.addEventListener("message", (ev) => {
        if (typeof ev.data === "string") {
          applyMessage(ev.data);
        }
      });

      socket.addEventListener("error", () => {
        if (!disposed) {
          setLastError("接続エラーが発生しました。");
        }
      });

      socket.addEventListener("close", () => {
        wsRef.current = null;
        if (disposed) {
          return;
        }
        setConnection("closed");
        attemptRef.current += 1;
        const delayMs = Math.min(
          30_000,
          800 * 2 ** Math.min(attemptRef.current, 6),
        );
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          if (!disposed) {
            openSocket();
          }
        }, delayMs);
      });
    };

    openSocket();

    return () => {
      disposed = true;
      clearReconnect();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [applyMessage, clearReconnect, wsUrl]);

  const heroImage =
    phase === "measuring"
      ? "/set3.png"
      : phase === "postureRegister"
        ? "/set2.png"
        : "/set1.png";

  const title =
    phase === "measuring"
      ? "姿勢測定中"
      : phase === "postureRegister"
        ? "良い姿勢を登録中"
        : "ホーム";

  const lead =
    phase === "measuring"
      ? "PC で姿勢測定が行われています。この画面を見ながらお待ちください。"
      : phase === "postureRegister"
        ? "PC で良い姿勢の登録が行われています。この画面を見ながらお待ちください。"
        : "PC の操作に合わせて表示が切り替わります。接続を維持したままお待ちください。";

  return (
    <main className={`remote-pairing-screen remote-pairing-screen--${phase}`}>
      <FlowBrand />
      <div className="remote-pairing-card">
        <p className="remote-pairing-badge" aria-live="polite">
          {connection === "open"
            ? "接続済み"
            : connection === "connecting"
              ? "接続中…"
              : "再接続中…"}
        </p>
        <h1 className="remote-pairing-title">{title}</h1>
        <p className="remote-pairing-lead">{lead}</p>
        <div className="remote-pairing-art" aria-hidden="true">
          <img src={heroImage} alt="" width={280} height={280} draggable={false} />
        </div>
        {lastError ? (
          <p className="remote-pairing-error" role="alert">
            {lastError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
