import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, FolderOpen, ListChecks, RefreshCcw } from "lucide-react";
import { Button, IconButton, Modal, StatusBadge } from "../../components/ui";
import {
  getDiagnosticEnvironment,
  runDiagnosticHealthCheck,
  type DiagnosticEnvironment,
  type DiagnosticHealthCheck,
  type DiagnosticHealthItem,
  type DiagnosticHealthStatus
} from "../../lib/api/diagnosticsApi";
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
  const [healthCheck, setHealthCheck] = useState<DiagnosticHealthCheck | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [showHealthResults, setShowHealthResults] = useState(false);
  const [loading, setLoading] = useState(true);

  const paths = useMemo(() => buildDiagnosticPaths(settings), [settings]);
  const healthSummary = useMemo(() => healthCheck ? summarizeHealthItems(healthCheck.items) : null, [healthCheck]);

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

  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      setHealthCheck(await runDiagnosticHealthCheck(settings.toolTargets));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "danger");
    } finally {
      setCheckingHealth(false);
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
      <SettingsSection title="健康检查" description="手动检查本机依赖和权限，不修改用户配置或真实工具目录。">
        <SettingsRow
          className="settings-health-row"
          title="本机依赖与权限"
          description={healthCheck ? `上次检查：${formatHealthCheckedAt(healthCheck.checkedAt)}` : "点击后检查 Node/npm/npx、GitHub CLI、skills.sh、符号链接权限和工具目录可写性。"}
          status={healthSummary ? (
            <span className="settings-health-summary">
              <StatusBadge tone="accent">可用 {healthSummary.ready}</StatusBadge>
              <StatusBadge tone={healthSummary.blocking > 0 ? healthSummaryTone(healthCheck?.items ?? []) : "neutral"}>需处理 {healthSummary.blocking}</StatusBadge>
              <StatusBadge tone="neutral">未执行 {healthSummary.skipped}</StatusBadge>
            </span>
          ) : <StatusBadge tone="neutral">未检查</StatusBadge>}
        >
          <Button disabled={checkingHealth} onClick={() => void checkHealth()}>
            <RefreshCcw className={checkingHealth ? "spin" : ""} size={15} />
            {checkingHealth ? "检查中" : healthCheck ? "重新检查" : "开始检查"}
          </Button>
          <Button disabled={!healthCheck} onClick={() => setShowHealthResults(true)}>
            <ListChecks size={15} />查看结果
          </Button>
        </SettingsRow>
      </SettingsSection>
      {showHealthResults && healthCheck && (
        <HealthResultsModal
          healthCheck={healthCheck}
          onClose={() => setShowHealthResults(false)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}

function HealthResultsModal({
  healthCheck,
  onClose,
  onNotify
}: {
  healthCheck: DiagnosticHealthCheck;
  onClose: () => void;
  onNotify: (message: string, tone?: ToastTone) => void;
}) {
  const groups = groupHealthItems(healthCheck.items);
  const blockingItems = healthCheck.items.filter(isBlockingHealthStatus);

  const copyHealthIssues = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("当前环境不支持剪贴板写入");
      }
      await navigator.clipboard.writeText(formatHealthIssues(blockingItems));
      onNotify("需处理项已复制", "success");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error), "danger");
    }
  };

  return (
    <Modal
      title="检查结果"
      description={`上次检查：${formatHealthCheckedAt(healthCheck.checkedAt)}`}
      large
      className="health-results-dialog"
      onClose={onClose}
      actions={<Button disabled={blockingItems.length === 0} onClick={() => void copyHealthIssues()}><ClipboardCopy size={15} />复制需处理项</Button>}
      footer={<span className="modal-footer-single"><Button onClick={onClose}>关闭</Button></span>}
    >
      <div className="health-results-body">
        {groups.map((group) => (
          <section className="health-result-group" key={group.title}>
            <div className="health-result-group-title">
              <h3>{group.title}</h3>
              <StatusBadge tone="neutral">{group.items.length} 项</StatusBadge>
            </div>
            <div className="health-result-list" role="list">
              {group.items.map((item) => (
                <HealthResultItem item={item} key={item.key} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function HealthResultItem({ item }: { item: DiagnosticHealthItem }) {
  const blocking = isBlockingHealthStatus(item);
  const detail = displayHealthDetail(item);
  const hint = healthActionHint(item);
  return (
    <div className={`health-result-item ${blocking ? "needs-action" : ""}`} role="listitem">
      <span>
        <strong>{item.name}</strong>
        <small>{compactHealthMessage(item)}</small>
        {detail && <code>{detail}</code>}
        {hint && <em>{hint}</em>}
      </span>
      <StatusBadge tone={healthStatusTone(item.status)}>{healthStatusLabel(item.status)}</StatusBadge>
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

function healthStatusLabel(status: DiagnosticHealthStatus) {
  switch (status) {
    case "ready":
      return "可用";
    case "missing":
      return "缺失";
    case "needs_config":
      return "需要配置";
    case "no_permission":
      return "无权限";
    case "failed":
      return "检查失败";
    case "skipped":
      return "未执行";
    default:
      return status;
  }
}

function healthStatusTone(status: DiagnosticHealthStatus) {
  switch (status) {
    case "ready":
      return "accent";
    case "skipped":
      return "neutral";
    case "needs_config":
      return "warning";
    case "missing":
    case "no_permission":
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function healthSummaryTone(items: Array<{ status: DiagnosticHealthStatus }>) {
  if (items.some((item) => ["missing", "no_permission", "failed"].includes(item.status))) return "danger";
  if (items.some((item) => item.status === "needs_config")) return "warning";
  return "accent";
}

function formatHealthCheckedAt(value: string) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return value;
  return formatDiagnosticTimestamp(new Date(timestamp));
}

function summarizeHealthItems(items: DiagnosticHealthItem[]) {
  return items.reduce(
    (summary, item) => {
      if (item.status === "ready") summary.ready += 1;
      if (item.status === "skipped") summary.skipped += 1;
      if (isBlockingHealthStatus(item)) summary.blocking += 1;
      return summary;
    },
    { ready: 0, blocking: 0, skipped: 0 }
  );
}

function isBlockingHealthStatus(item: Pick<DiagnosticHealthItem, "status">) {
  return ["missing", "needs_config", "no_permission", "failed"].includes(item.status);
}

function groupHealthItems(items: DiagnosticHealthItem[]) {
  const groups = [
    {
      title: "基础依赖",
      items: items.filter((item) => ["node", "npm", "npx", "skills-sh"].includes(item.key))
    },
    {
      title: "账号与工具",
      items: items.filter((item) => item.key === "github-cli")
    },
    {
      title: "权限与目录",
      items: items.filter((item) => item.key === "symlink-permission" || item.key.startsWith("tool-directory") || item.key === "tool-directories")
    }
  ];
  const groupedKeys = new Set(groups.flatMap((group) => group.items.map((item) => item.key)));
  const otherItems = items.filter((item) => !groupedKeys.has(item.key));
  if (otherItems.length > 0) groups.push({ title: "其他检查", items: otherItems });
  return groups.filter((group) => group.items.length > 0);
}

function compactHealthMessage(item: DiagnosticHealthItem) {
  if (item.key === "skills-sh" && item.status === "skipped") return "依赖已满足，未主动运行在线命令。";
  if (item.status === "ready" && item.detail && ["node", "npm", "npx"].includes(item.key)) return item.detail;
  return item.message;
}

function displayHealthDetail(item: DiagnosticHealthItem) {
  if (!item.detail) return "";
  if (item.key === "github-cli" && item.status === "ready") return "";
  if (item.status === "ready" && ["node", "npm", "npx"].includes(item.key)) return "";
  return item.detail;
}

function healthActionHint(item: DiagnosticHealthItem) {
  if (item.key === "github-cli" && item.status === "needs_config") return "建议：运行 gh auth login。";
  if (item.key === "skills-sh" && item.status === "missing") return "建议：先修复 Node/npm/npx 依赖链路。";
  if (item.key === "symlink-permission" && item.status === "no_permission") return "建议：开启 Windows 开发者模式，或用具备权限的环境重试。";
  if (item.key.startsWith("tool-directory") && item.status === "missing") return "建议：在工具目录设置中确认路径存在。";
  return "";
}

function formatHealthIssues(items: DiagnosticHealthItem[]) {
  if (items.length === 0) return "Workbench Health Check\nNo blocking items.";
  return [
    "Workbench Health Check Issues",
    ...items.flatMap((item) => [
      "",
      `- ${item.name}: ${healthStatusLabel(item.status)}`,
      `  Message: ${item.message}`,
      item.detail ? `  Detail: ${item.detail}` : "",
      healthActionHint(item) ? `  Hint: ${healthActionHint(item)}` : ""
    ].filter(Boolean))
  ].join("\n");
}
