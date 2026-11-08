import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type DeveloperAccessStatus = "checking" | "authenticated" | "anonymous";

type DeveloperAccessValue = {
  enabled: boolean;
  canLogout: boolean;
  status: DeveloperAccessStatus;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
};

const buildEnablesDebugUi = import.meta.env.VITE_SHOW_DEBUG_UI === "true";

const DeveloperAccessContext = createContext<DeveloperAccessValue | null>(null);

export function DeveloperAccessProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DeveloperAccessStatus>(
    buildEnablesDebugUi ? "authenticated" : "checking",
  );

  const refresh = useCallback(async () => {
    if (buildEnablesDebugUi) {
      setStatus("authenticated");
      return true;
    }

    try {
      const response = await fetch("/api/dev-session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = (await response.json()) as { authenticated?: boolean };
      const authenticated = response.ok && result.authenticated === true;
      setStatus(authenticated ? "authenticated" : "anonymous");
      return authenticated;
    } catch {
      setStatus("anonymous");
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (buildEnablesDebugUi) {
      return;
    }

    try {
      await fetch("/api/dev-logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    if (!buildEnablesDebugUi) {
      void refresh();
    }
  }, [refresh]);

  const value = useMemo<DeveloperAccessValue>(
    () => ({
      enabled: status === "authenticated",
      canLogout: !buildEnablesDebugUi && status === "authenticated",
      status,
      refresh,
      logout,
    }),
    [logout, refresh, status],
  );

  return (
    <DeveloperAccessContext.Provider value={value}>
      {children}
    </DeveloperAccessContext.Provider>
  );
}

export function useDeveloperAccess() {
  const value = useContext(DeveloperAccessContext);
  if (!value) {
    throw new Error("useDeveloperAccess must be used inside DeveloperAccessProvider");
  }

  return value;
}
