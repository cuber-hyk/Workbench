import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AppUpdateInfo, AppUpdateProgress, LegacyWorkbenchInstall } from "../lib/api/updateApi";
import { checkForAppUpdate, deleteLegacyWorkbenchShortcuts, downloadAndInstallAppUpdate, getCurrentAppVersion, inspectLegacyWorkbenchInstall, openLegacyWorkbenchUninstaller, restartAppForUpdate } from "../lib/api/updateApi";

type AppUpdateStatus = "idle" | "checking" | "available" | "current" | "downloading" | "ready-to-restart" | "error" | "unsupported";

interface AppUpdateContextValue {
  status: AppUpdateStatus;
  currentVersion: string;
  updateInfo: AppUpdateInfo | null;
  downloadProgress: AppUpdateProgress;
  error: string;
  legacyInstall: LegacyWorkbenchInstall | null;
  legacyInstallError: string;
  hasUpdate: boolean;
  checkUpdate: (options?: { silent?: boolean }) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restart: () => Promise<void>;
  inspectLegacyInstall: () => Promise<void>;
  deleteLegacyShortcuts: () => Promise<void>;
  openLegacyUninstaller: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | undefined>(undefined);
const STARTUP_UPDATE_CHECK_DELAY_MS = 10_000;

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppUpdateStatus>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<AppUpdateProgress>(emptyProgress());
  const [error, setError] = useState("");
  const [legacyInstall, setLegacyInstall] = useState<LegacyWorkbenchInstall | null>(null);
  const [legacyInstallError, setLegacyInstallError] = useState("");
  const checkingRef = useRef(false);

  useEffect(() => {
    void getCurrentAppVersion().then(setCurrentVersion).catch(() => setCurrentVersion(""));
  }, []);

  const inspectLegacyInstall = useCallback(async () => {
    try {
      setLegacyInstallError("");
      setLegacyInstall(await inspectLegacyWorkbenchInstall());
    } catch (caught) {
      setLegacyInstallError(formatLegacyInstallError(caught));
    }
  }, []);

  const checkUpdate = useCallback(async (options?: { silent?: boolean }) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    if (!options?.silent) setStatus("checking");
    setError("");
    setDownloadProgress(emptyProgress());

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
    setDownloadProgress(emptyProgress());

    try {
      await downloadAndInstallAppUpdate((event) => {
        setDownloadProgress((current) => reduceUpdateProgress(current, event));
      });
      setDownloadProgress((current) => ({
        ...current,
        percent: 100
      }));
      setStatus("ready-to-restart");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  }, []);

  const restart = useCallback(async () => {
    await restartAppForUpdate();
  }, []);

  const deleteLegacyShortcuts = useCallback(async () => {
    try {
      setLegacyInstallError("");
      setLegacyInstall(await deleteLegacyWorkbenchShortcuts());
    } catch (caught) {
      setLegacyInstallError(formatLegacyInstallError(caught));
    }
  }, []);

  const openLegacyUninstaller = useCallback(async () => {
    try {
      setLegacyInstallError("");
      await openLegacyWorkbenchUninstaller();
    } catch (caught) {
      setLegacyInstallError(formatLegacyInstallError(caught));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkUpdate({ silent: true });
    }, STARTUP_UPDATE_CHECK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [checkUpdate]);

  useEffect(() => {
    void inspectLegacyInstall();
  }, [inspectLegacyInstall]);

  return (
    <AppUpdateContext.Provider
      value={{
        status,
        currentVersion,
        updateInfo,
        downloadProgress,
        error,
        legacyInstall,
        legacyInstallError,
        hasUpdate: Boolean(updateInfo) && status === "available",
        checkUpdate,
        downloadAndInstall,
        restart,
        inspectLegacyInstall,
        deleteLegacyShortcuts,
        openLegacyUninstaller
      }}
    >
      {children}
    </AppUpdateContext.Provider>
  );
}

function formatLegacyInstallError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  return `旧版安装检查失败：${message}`;
}

function emptyProgress(): AppUpdateProgress {
  return { percent: null, downloaded: 0, total: null };
}

export function reduceUpdateProgress(current: AppUpdateProgress, rawEvent: unknown): AppUpdateProgress {
  if (!rawEvent || typeof rawEvent !== "object") return current;

  const event = rawEvent as {
    event?: string;
    data?: {
      contentLength?: number;
      chunkLength?: number;
      downloaded?: number;
      total?: number;
    };
  };

  if (event.event === "Started") {
    const total = numberOrNull(event.data?.contentLength ?? event.data?.total);
    return { percent: null, downloaded: 0, total };
  }

  if (event.event === "Progress") {
    const total = numberOrNull(event.data?.total) ?? current.total;
    const downloaded = numberOrNull(event.data?.downloaded) ?? current.downloaded + (event.data?.chunkLength ?? 0);
    return {
      total,
      downloaded,
      percent: total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null
    };
  }

  if (event.event === "Finished") {
    return {
      ...current,
      percent: 100
    };
  }

  return current;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
