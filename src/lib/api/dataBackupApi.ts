import { invoke } from "@tauri-apps/api/core";

export interface LocalDataBackupManifest {
  backupFormatVersion: number;
  createdAt: string;
  appVersion: string;
  sourceWorkbenchRoot: string;
  sqliteFileName: string;
  sqliteSizeBytes: number;
  includesSkillsDirectory: boolean;
}

export interface LocalDataBackupSummary {
  backupPath: string;
  backupDirectory: string;
  sqliteSizeBytes: number;
  manifest: LocalDataBackupManifest;
}

export interface LocalDataRestoreInspection {
  backupPath: string;
  manifest: LocalDataBackupManifest;
}

export interface LocalDataRestoreSummary {
  restoredDatabasePath: string;
  previousDatabaseBackupPath: string;
  manifest: LocalDataBackupManifest;
}

export interface AutoBackupSettings {
  enabled: boolean;
  retention: 10 | 20 | 30;
  lastBackupAt: string | null;
}

const isTauri = "__TAURI_INTERNALS__" in window;

export async function createLocalDataBackup(): Promise<LocalDataBackupSummary> {
  if (!isTauri) return webPreviewUnavailable();
  return invoke<LocalDataBackupSummary>("create_local_data_backup");
}

export async function selectLocalDataBackupFile(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("select_local_data_backup_file");
}

export async function inspectLocalDataBackup(path: string): Promise<LocalDataRestoreInspection> {
  if (!isTauri) return webPreviewUnavailable();
  return invoke<LocalDataRestoreInspection>("inspect_local_data_backup", { path });
}

export async function restoreLocalDataBackup(path: string): Promise<LocalDataRestoreSummary> {
  if (!isTauri) return webPreviewUnavailable();
  return invoke<LocalDataRestoreSummary>("restore_local_data_backup", { path });
}

export async function getAutoBackupSettings(): Promise<AutoBackupSettings> {
  if (!isTauri) return { enabled: false, retention: 10, lastBackupAt: null };
  return invoke<AutoBackupSettings>("get_auto_backup_settings");
}

export async function setAutoBackupSettings(enabled: boolean, retention: AutoBackupSettings["retention"]): Promise<AutoBackupSettings> {
  if (!isTauri) return { enabled, retention, lastBackupAt: null };
  const settings = await invoke<AutoBackupSettings>("set_auto_backup_settings", { enabled, retention });
  void markLocalDataChanged().catch(() => undefined);
  return settings;
}

export async function markLocalDataChanged(): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("mark_local_data_changed");
}

function webPreviewUnavailable(): never {
  throw new Error("本地数据备份与恢复仅在 Tauri 桌面应用中可用。");
}
