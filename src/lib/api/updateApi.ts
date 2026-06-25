import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  body?: string;
  date?: string;
}

export interface AppReleaseNotes {
  tagName: string;
  name?: string | null;
  body?: string | null;
  publishedAt?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

export interface AppUpdateProgress {
  percent: number | null;
  downloaded: number;
  total: number | null;
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
      body: await resolveReleaseNotesBody(currentVersion, update.version, update.body),
      date: update.date
    }
  };
}

async function resolveReleaseNotesBody(currentVersion: string, latestVersion: string, fallbackBody?: string) {
  try {
    const releases = await listAppReleases();
    return cumulativeReleaseNotesBody({ currentVersion, latestVersion, fallbackBody, releases });
  } catch {
    return fallbackBody;
  }
}

async function listAppReleases() {
  return invoke<AppReleaseNotes[]>("list_app_releases");
}

export function cumulativeReleaseNotesBody({
  currentVersion,
  latestVersion,
  fallbackBody,
  releases
}: {
  currentVersion: string;
  latestVersion: string;
  fallbackBody?: string;
  releases: AppReleaseNotes[];
}) {
  const candidates = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ release, version: parseVersion(release.tagName) }))
    .filter((entry): entry is { release: AppReleaseNotes; version: number[] } => Boolean(entry.version))
    .filter(({ version }) => compareVersions(version, parseVersion(currentVersion)) > 0 && compareVersions(version, parseVersion(latestVersion)) <= 0)
    .sort((left, right) => compareVersions(right.version, left.version));

  const body = candidates
    .map(({ release, version }) => formatReleaseBody(release, version))
    .filter(Boolean)
    .join("\n\n");

  return body || fallbackBody;
}

function formatReleaseBody(release: AppReleaseNotes, version: number[]) {
  const body = release.body?.trim();
  if (!body) return "";
  const versionText = version.join(".");
  const date = release.publishedAt?.slice(0, 10);
  const title = date ? `## [${versionText}] - ${date}` : `## [${versionText}]`;
  return `${title}\n\n${body.replace(/^\uFEFF?##\s+.+$/m, "").trim()}`;
}

function parseVersion(version: string | null | undefined) {
  if (!version) return null;
  const match = version.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersions(left: number[] | null, right: number[] | null) {
  if (!left || !right) return 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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
