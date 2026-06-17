import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AppUpdateInfo } from "../lib/api/updateApi";
import { checkForAppUpdate, downloadAndInstallAppUpdate, getCurrentAppVersion, restartAppForUpdate } from "../lib/api/updateApi";

type AppUpdateStatus = "idle" | "checking" | "available" | "current" | "downloading" | "ready-to-restart" | "error" | "unsupported";

interface AppUpdateContextValue {
  status: AppUpdateStatus;
  currentVersion: string;
  updateInfo: AppUpdateInfo | null;
  error: string;
  hasUpdate: boolean;
  checkUpdate: (options?: { silent?: boolean }) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restart: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | undefined>(undefined);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppUpdateStatus>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [error, setError] = useState("");
  const checkingRef = useRef(false);

  useEffect(() => {
    void getCurrentAppVersion().then(setCurrentVersion).catch(() => setCurrentVersion(""));
  }, []);

  const checkUpdate = useCallback(async (options?: { silent?: boolean }) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    if (!options?.silent) setStatus("checking");
    setError("");

    try {
      const result = await checkForAppUpdate();
      if (result.status === "available") {
        setUpdateInfo(result.info);
        setCurrentVersion(result.info.currentVersion);
        setStatus("available");
        return;
      }

      setUpdateInfo(null);
      setCurrentVersion(result.currentVersion);
      setStatus(result.status);
    } catch (caught) {
      if (!options?.silent) {
        setError(formatAppUpdateError(caught));
        setStatus("error");
      } else {
        setStatus("idle");
      }
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    setStatus("downloading");
    setError("");

    try {
      await downloadAndInstallAppUpdate();
      setStatus("ready-to-restart");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  }, []);

  const restart = useCallback(async () => {
    await restartAppForUpdate();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkUpdate({ silent: true });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [checkUpdate]);

  return (
    <AppUpdateContext.Provider
      value={{
        status,
        currentVersion,
        updateInfo,
        error,
        hasUpdate: Boolean(updateInfo) && status === "available",
        checkUpdate,
        downloadAndInstall,
        restart
      }}
    >
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate() {
  const context = useContext(AppUpdateContext);
  if (!context) throw new Error("useAppUpdate must be used within AppUpdateProvider");
  return context;
}

function formatAppUpdateError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);

  if (
    message.includes("Could not fetch a valid release JSON") ||
    message.includes("latest.json") ||
    message.includes("404")
  ) {
    return "还没有发布可用于自动更新的 Release 元数据（latest.json）。发布第一版带更新产物的 GitHub Release 后，检查更新才会返回真实结果。";
  }

  if (message.toLowerCase().includes("network") || message.includes("fetch")) {
    return "检查更新失败：无法连接到 GitHub Releases，请检查网络后重试。";
  }

  return `检查更新失败：${message}`;
}
