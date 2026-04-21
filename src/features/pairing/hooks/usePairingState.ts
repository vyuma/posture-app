import { useEffect, useState } from "react";

import {
  getDesktopPairingStatus,
  getPairingInfo,
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

const defaultState: PairingState = {
  pairingInfo: null,
  status: null,
  isLoading: true,
  error: null,
};

export function usePairingState() {
  const [state, setState] = useState<PairingState>(defaultState);

  useEffect(() => {
    let active = true;

    async function loadInitialState() {
      try {
        const [pairingInfo, status] = await Promise.all([
          getPairingInfo(),
          getDesktopPairingStatus(),
        ]);

        if (!active) {
          return;
        }

        setState({
          pairingInfo,
          status,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "ペアリング状態の読み込みに失敗しました。",
        }));
      }
    }

    void loadInitialState();

    const intervalId = window.setInterval(async () => {
      try {
        const status = await getDesktopPairingStatus();

        if (!active) {
          return;
        }

        setState((prev) => ({
          ...prev,
          status,
          error: null,
        }));
      } catch (error) {
        if (!active) {
          return;
        }

        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "接続状態の更新に失敗しました。",
        }));
      }
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return {
    ...state,
    refresh: async () => {
      const [pairingInfo, status] = await Promise.all([
        getPairingInfo(),
        getDesktopPairingStatus(),
      ]);

      setState({
        pairingInfo,
        status,
        isLoading: false,
        error: null,
      });
    },
  };
}
