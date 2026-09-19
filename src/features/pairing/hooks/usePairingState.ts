import { useEffect, useRef, useState } from "react";

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
const INITIAL_LOAD_ERROR_MESSAGE = "ペアリング状態の読み込みに失敗しました。";
const STATUS_POLL_ERROR_MESSAGE = "接続状態の更新に失敗しました。";
const REFRESH_ERROR_MESSAGE = "ペアリング情報の更新に失敗しました。";

const defaultState: PairingState = {
  pairingInfo: null,
  status: null,
  isLoading: true,
  error: null,
};

let pendingSnapshot: Promise<[PairingInfo, DesktopPairingStatus]> | undefined;
const readPairingSnapshot = () => pendingSnapshot ??= (async (): Promise<[PairingInfo, DesktopPairingStatus]> => {
  // The public relay creates the PC's owner cookie when info is first requested.
  const info = await getPairingInfo();
  return [info, await getDesktopPairingStatus()];
})().finally(() => { pendingSnapshot = undefined; });

export function usePairingState() {
  const [state, setState] = useState<PairingState>(defaultState);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

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
        const [pairingInfo, status] = await readPairingSnapshot();

        if (!isMountedRef.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          pairingInfo,
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
      setState((previous) => ({ ...previous, isLoading: true }));
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
