import { Activity, Database, Monitor, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getDiagnosticEnvironment,
  getLocalWorkspaceSystemStatus,
  type DiagnosticEnvironment,
  type LocalWorkspaceSystemStatus
} from "../lib/api/diagnosticsApi";

interface LocalWorkspaceStatusProps {
  refreshIntervalSeconds: number;
  projectCount: number;
  skillCount: number;
}

type StatusTone = "neutral" | "success" | "warning" | "danger";

const emptyEnvironment: DiagnosticEnvironment = {
  runtime: "web-preview",
  tauriAvailable: false,
  platform: "unknown",
  arch: "unknown"
};

const emptySystemStatus: LocalWorkspaceSystemStatus = {
  memory: {
    totalBytes: 0,
    usedBytes: 0,
    availableBytes: 0
  }
};

export function LocalWorkspaceStatus({
  refreshIntervalSeconds,
  projectCount,
  skillCount
}: LocalWorkspaceStatusProps) {
  const [environment, setEnvironment] = useState<DiagnosticEnvironment>(emptyEnvironment);
  const [systemStatus, setSystemStatus] = useState<LocalWorkspaceSystemStatus>(emptySystemStatus);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let intervalId: number | undefined;

    const loadStatus = (showLoading: boolean) => {
      if (inFlight) return;
      inFlight = true;
      if (showLoading) setLoading(true);
      Promise.all([
        getDiagnosticEnvironment(),
        getLocalWorkspaceSystemStatus()
      ])
        .then(([nextEnvironment, nextSystemStatus]) => {
          if (!active) return;
          setEnvironment(nextEnvironment);
          setSystemStatus(nextSystemStatus);
        })
        .catch(() => {
          if (!active) return;
          setEnvironment(emptyEnvironment);
          setSystemStatus(emptySystemStatus);
        })
        .finally(() => {
          inFlight = false;
          if (active) setLoading(false);
        });
    };

    loadStatus(true);
    if (refreshIntervalSeconds > 0) {
      intervalId = window.setInterval(() => loadStatus(false), refreshIntervalSeconds * 1000);
    }

    return () => {
      active = false;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [refreshIntervalSeconds]);

  const summary = useMemo(() => buildStatusSummary(systemStatus, loading), [systemStatus, loading]);
  const healthTone: StatusTone = loading || summary.unavailable ? "neutral" : summary.blocking ? "warning" : "success";
  const healthLabel = loading ? "读取中" : summary.unavailable ? "不可用" : summary.blocking ? "资源紧张" : "正常";

  return (
    <section className="local-strip local-workspace-status" aria-label="本机工作区状态">
      <div className="local-workspace-status-head">
        <span>
          <strong>本机工作区</strong>
          <small>{environment.tauriAvailable ? `${environment.platform} / ${environment.arch}` : "预览模式"}</small>
        </span>
      </div>
      <div className="local-workspace-status-list">
        <StatusRow icon={<Activity size={13} />} label="健康" value={healthLabel} tone={healthTone} />
        <StatusRow icon={<Monitor size={13} />} label="内存" value={formatMemoryUsage(systemStatus)} tone={summary.memoryTone} />
        <StatusRow icon={<Sparkles size={13} />} label="Skills" value={`${skillCount} 个`} />
        <StatusRow icon={<Database size={13} />} label="项目" value={`${projectCount} 个`} />
      </div>
    </section>
  );
}

function StatusRow({
  icon,
  label,
  value,
  tone = "neutral"
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <span className={`local-workspace-status-row ${tone}`}>
      <span className="local-workspace-status-label">
        {icon}
        <b>{label}</b>
      </span>
      <small>{value}</small>
    </span>
  );
}

function buildStatusSummary(status: LocalWorkspaceSystemStatus, loading: boolean): {
  blocking: boolean;
  unavailable: boolean;
  memoryTone: StatusTone;
} {
  if (loading) {
    return {
      blocking: false,
      unavailable: false,
      memoryTone: "neutral" as StatusTone
    };
  }
  const unavailable = status.memory.totalBytes <= 0;
  const memoryRatio = ratio(status.memory.usedBytes, status.memory.totalBytes);
  const memoryTone = memoryRatio >= 0.9 ? "danger" : memoryRatio >= 0.8 ? "warning" : "neutral";
  return {
    blocking: !unavailable && memoryTone !== "neutral",
    unavailable,
    memoryTone
  };
}

function ratio(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return part / total;
}

function formatMemoryUsage(status: LocalWorkspaceSystemStatus) {
  if (status.memory.totalBytes <= 0) return "不可用";
  return `${formatGibValue(status.memory.usedBytes)} / ${formatBytes(status.memory.totalBytes)}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 GB";
  return `${formatGibValue(value)} GB`;
}

function formatGibValue(value: number) {
  const gib = value / 1024 ** 3;
  if (gib >= 10) return String(Math.round(gib));
  return gib.toFixed(1);
}
