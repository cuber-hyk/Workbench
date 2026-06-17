import { getVersion } from "@tauri-apps/api/app";

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  body?: string;
  date?: string;
}

export type AppUpdateCheckResult =
  | { status: "available"; info: AppUpdateInfo }
  | { status: "current"; currentVersion: string }
  | { status: "unsupported"; currentVersion: string };

type TauriUpdate = {
  version: string;
  body?: string;
  date?: string;
  downloadAndInstall: (onEvent?: (event: unknown) => void) => Promise<void>;
};

const isTauri = "__TAURI_INTERNALS__" in window;
let pendingUpdate: TauriUpdate | null = null;

export async function getCurrentAppVersion() {
  if (!isTauri) return "web-preview";
  return getVersion();
}

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = await getCurrentAppVersion();
  if (!isTauri) return { status: "unsupported", currentVersion };

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = (await check()) as TauriUpdate | null;
  pendingUpdate = update;

  if (!update) return { status: "current", currentVersion };

  return {
    status: "available",
    info: {
      currentVersion,
      latestVersion: update.version,
      body: update.body,
      date: update.date
    }
  };
}

export async function downloadAndInstallAppUpdate(onEvent?: (event: unknown) => void) {
  if (!pendingUpdate) {
    const result = await checkForAppUpdate();
    if (result.status !== "available" || !pendingUpdate) {
      throw new Error("当前没有可安装的更新。");
    }
  }

  await pendingUpdate.downloadAndInstall(onEvent);
}

export async function restartAppForUpdate() {
  if (!isTauri) return;

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
