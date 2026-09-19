import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { syncBrowserPairingSession } from "../services/desktopBridge";

export function useBrowserPairingSession(measuring: boolean, registering: boolean) {
  useEffect(() => {
    if (isTauri()) return;
    const sync = () => { void syncBrowserPairingSession({ measuring, registering }).catch(() => {}); };
    const stop = () => { void syncBrowserPairingSession({ measuring: false, registering: false }).catch(() => {}); };
    sync();
    const timer = window.setInterval(sync, 5000);
    window.addEventListener("pagehide", stop);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", stop);
    };
  }, [measuring, registering]);

  useEffect(() => () => {
    void syncBrowserPairingSession({ measuring: false, registering: false }).catch(() => {});
  }, []);
}
