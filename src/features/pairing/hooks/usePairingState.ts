import { useEffect, useRef, useState } from "react";

import { isTauriRuntime } from "../../../lib/tauriRuntime";
import {
  getDesktopPairingStatus,
  getPairingInfo,
  WEB_DESKTOP_PAIRING_STATUS,
  type DesktopPairingStatus,
} from "../services/desktopBridge";
import type { PairingInfo } from "../types/pairing";

type PairingState = {
  pairingInfo: PairingInfo | null;
  status: DesktopPairingStatus | null;
  isLoading: boolean;
  error: string | null;
};

const POLL_INTERVAL_MS = 1500;
const INITIAL_LOAD_ERROR_MESSAGE = "ペアリング状態の読み込みに失敗しました。";
const STATUS_POLL_ERROR_MESSAGE = "接続状態の更新に失敗しました。";
const REFRESH_ERROR_MESSAGE = "ペアリング情報の更新に失敗しました。";

const defaultState: PairingState = {
  pairingInfo: null,
  status: null,
  isLoading: true,
  error: null,
};

const readPairingSnapshot = () =>
  Promise.all([getPairingInfo(), getDesktopPairingStatus()]);

export function usePairingState() {
  const [state, setState] = useState<PairingState>(defaultState);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!isTauriRuntime()) {
      setState({
        pairingInfo: null,
        status: WEB_DESKTOP_PAIRING_STATUS,
        isLoading: false,
        error: null,
      });
      return () => {
        isMountedRef.current = false;
      };
    }

    async function loadInitialState() {
      try {
        const [pairingInfo, status] = await readPairingSnapshot();

        if (!isMountedRef.current) {
          return;
        }

        setState({
          pairingInfo,
          status,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : INITIAL_LOAD_ERROR_MESSAGE,
        }));
      }
    }

    void loadInitialState();

    const intervalId = window.setInterval(async () => {
      try {
        const status = await getDesktopPairingStatus();

        if (!isMountedRef.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          status,
          error: null,
        }));
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : STATUS_POLL_ERROR_MESSAGE,
        }));
      }
    }, POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return {
    ...state,
    refresh: async () => {
      if (!isTauriRuntime()) {
        setState({
          pairingInfo: null,
          status: WEB_DESKTOP_PAIRING_STATUS,
          isLoading: false,
          error: null,
        });
        return;
      }

      try {
        const [pairingInfo, status] = await readPairingSnapshot();

        if (!isMountedRef.current) {
          return;
        }

        setState({
          pairingInfo,
          status,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : REFRESH_ERROR_MESSAGE,
        }));
      }
    },
  };
}
