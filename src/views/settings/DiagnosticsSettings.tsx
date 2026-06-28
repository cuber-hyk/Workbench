import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, FolderOpen } from "lucide-react";
import { Button, IconButton, StatusBadge } from "../../components/ui";
import { getDiagnosticEnvironment, type DiagnosticEnvironment } from "../../lib/api/diagnosticsApi";
import { getCurrentAppVersion } from "../../lib/api/updateApi";
import type { AppSettings } from "../../lib/types/domain";
import { SettingsContentHeader, SettingsRow, SettingsSection } from "./settingsLayout";

type ToastTone = "success" | "warning" | "danger";

interface DiagnosticsSettingsProps {
  settings: AppSettings;
  onOpenPath: (path: string) => void;
  onOpenDirectory: (path: string) => void | Promise<void>;
  onNotify?: (message: string, tone?: ToastTone) => void;
}

const emptyEnvironment: DiagnosticEnvironment = {
  runtime: "web-preview",
  tauriAvailable: false,
  platform: "unknown",
  arch: "unknown"
};

export function DiagnosticsSettings({
  settings,
  onOpenPath,
  onOpenDirectory,
  onNotify = () => undefined
}: DiagnosticsSettingsProps) {
  const [version, setVersion] = useState("读取中");
  const [environment, setEnvironment] = useState<DiagnosticEnvironment>(emptyEnvironment);
  const [loading, setLoading] = useState(true);

  const paths = useMemo(() => buildDiagnosticPaths(settings), [settings]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getCurrentAppVersion(), getDiagnosticEnvironment()])
      .then(([nextVersion, nextEnvironment]) => {
        if (!active) return;
        setVersion(nextVersion);
        setEnvironment(nextEnvironment);
      })
      .catch(() => {
        if (!active) return;
        setVersion("unknown");
        setEnvironment(emptyEnvironment);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const copyDiagnosticInfo = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("当前环境不支持剪贴板写入");
      }
      await navigator.clipboard.writeText(formatDiagnosticInfo({
        version,
        environment,
        frontendMode: import.meta.env.MODE,
        paths,
        generatedAt: new Date()
      }));
      onNotify("诊断信息已复制", "success");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "danger");
    }
  };

  return (
    <div className="settings-form">
      <SettingsContentHeader title="诊断" description="查看 Workbench 运行环境、数据位置和日志入口。" />
      <SettingsSection title="运行信息" description="这些信息用于定位版本、运行方式和系统环境问题。">
        <SettingsRow
          title="Workbench 版本"
          description={version}
          status={<StatusBadge tone={loading ? "neutral" : "accent"}>{loading ? "读取中" : "当前"}</StatusBadge>}
        >
          <span />
        </SettingsRow>
        <SettingsRow
          title="运行环境"
          description={environment.runtime}
          status={<StatusBadge tone={environment.tauriAvailable ? "accent" : "neutral"}>{environment.tauriAvailable ? "桌面" : "预览"}</StatusBadge>}
        >
          <span />
        </SettingsRow>
        <SettingsRow
          title="前端模式"
          description={import.meta.env.MODE}
          status={<StatusBadge tone="neutral">Vite</StatusBadge>}
        >
          <span />
        </SettingsRow>
        <SettingsRow
          title="系统平台"
          description={`${environment.platform} / ${environment.arch}`}
          status={<StatusBadge tone="neutral">System</StatusBadge>}
        >
          <span />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="本地路径" description="只展示 Workbench 排障需要的本地目录，不收集项目列表或环境变量。">
        <SettingsRow
          title="Workbench 数据目录"
          description={paths.workbenchRoot}
          status={<StatusBadge tone="neutral">本地</StatusBadge>}
        >
          <IconButton title="打开 Workbench 数据目录" onClick={() => onOpenPath(paths.workbenchRoot)}><FolderOpen size={15} /></IconButton>
        </SettingsRow>
        <SettingsRow
          title="SQLite 数据库"
          description={paths.sqliteDatabase}
          status={<StatusBadge tone="neutral">SQLite</StatusBadge>}
        >
          <IconButton title="打开数据库所在目录" onClick={() => onOpenPath(paths.workbenchRoot)}><FolderOpen size={15} /></IconButton>
        </SettingsRow>
        <SettingsRow
          title="Skills 根目录"
          description={paths.skillsRoot}
          status={<StatusBadge tone="neutral">Skills</StatusBadge>}
        >
          <IconButton title="打开 Skills 根目录" onClick={() => onOpenPath(paths.skillsRoot)}><FolderOpen size={15} /></IconButton>
        </SettingsRow>
        <SettingsRow
          title="日志目录"
          description={paths.logDirectory}
          status={<StatusBadge tone="neutral">Logs</StatusBadge>}
        >
          <IconButton title="打开日志目录" onClick={() => void onOpenDirectory(paths.logDirectory)}><FolderOpen size={15} /></IconButton>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="排障操作" description="复制的信息可直接贴给维护者，目录按钮只打开本机路径。">
        <SettingsRow
          title="复制诊断信息"
          description="复制版本、运行环境和本地路径；不包含 token、环境变量或项目列表。"
          status={<StatusBadge tone="accent">低敏</StatusBadge>}
        >
          <Button disabled={loading} onClick={() => void copyDiagnosticInfo()}><ClipboardCopy size={15} />复制诊断信息</Button>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export function buildDiagnosticPaths(settings: AppSettings) {
  const workbenchRoot = trimTrailingSeparators(settings.workbenchRoot);
  return {
    workbenchRoot,
    skillsRoot: settings.skillsRoot,
    sqliteDatabase: joinDisplayPath(workbenchRoot, "workbench.sqlite"),
    logDirectory: joinDisplayPath(workbenchRoot, "logs")
  };
}

export function formatDiagnosticInfo({
  version,
  environment,
  frontendMode,
  paths,
  generatedAt
}: {
  version: string;
  environment: DiagnosticEnvironment;
  frontendMode: string;
  paths: ReturnType<typeof buildDiagnosticPaths>;
  generatedAt: Date;
}) {
  return [
    "Workbench Diagnostic Info",
    `Version: ${version}`,
    `Runtime: ${environment.runtime}`,
    `Frontend mode: ${frontendMode}`,
    `Tauri available: ${environment.tauriAvailable ? "yes" : "no"}`,
    `OS: ${environment.platform}`,
    `Arch: ${environment.arch}`,
    `Workbench root: ${paths.workbenchRoot}`,
    `SQLite database: ${paths.sqliteDatabase}`,
    `Skills root: ${paths.skillsRoot}`,
    `Log directory: ${paths.logDirectory}`,
    `Generated at: ${formatDiagnosticTimestamp(generatedAt)}`
  ].join("\n");
}

function joinDisplayPath(root: string, child: string) {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root}${separator}${child}`;
}

function trimTrailingSeparators(path: string) {
  return path.replace(/[\\/]+$/, "");
}

function formatDiagnosticTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
