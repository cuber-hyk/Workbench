import { ArrowUpCircle, RefreshCcw, RotateCcw } from "lucide-react";
import { useAppUpdate } from "../contexts/AppUpdateContext";
import { Button, IconButton, Modal, StatusBadge } from "./ui";

export function AppUpdatePanel({
  onOpenDetails
}: {
  onOpenDetails: () => void;
}) {
  const { status, currentVersion, updateInfo, checkUpdate } = useAppUpdate();
  const checking = status === "checking";

  return (
    <section className="settings-panel update-settings-panel compact-update-panel">
      <div className="settings-panel-title">
        <span>
          <h2>软件更新</h2>
          <p>启动后会静默检查更新；发现新版本时可从左下角入口查看详情。</p>
        </span>
        <StatusBadge tone={updateStatusTone(status)}>{updateStatusLabel(status)}</StatusBadge>
      </div>
      <div className="settings-row update-compact-row">
        <span>
          <small>当前版本</small>
          <strong>{currentVersion || "读取中"}</strong>
          {updateInfo && <small>发现新版本 {updateInfo.latestVersion}</small>}
        </span>
        <span className="settings-row-actions">
          <Button onClick={() => void checkUpdate()} disabled={checking}>
            <RefreshCcw size={15} />
            {checking ? "检查中" : "检查更新"}
          </Button>
          <Button onClick={onOpenDetails} disabled={status === "idle" && !updateInfo}>
            <ArrowUpCircle size={15} />
            查看更新
          </Button>
        </span>
      </div>
    </section>
  );
}

export function AppUpdateDialog({ onClose }: { onClose: () => void }) {
  const {
    status,
    currentVersion,
    updateInfo,
    downloadProgress,
    error,
    checkUpdate,
    downloadAndInstall,
    restart
  } = useAppUpdate();
  const checking = status === "checking";
  const downloading = status === "downloading";
  const canInstall = status === "available" && updateInfo;

  return (
    <Modal
      title="软件更新"
      description={dialogDescription(status)}
      onClose={onClose}
      actions={
        status !== "downloading" && status !== "ready-to-restart" ? (
          <IconButton title={checking ? "检查中" : "检查更新"} onClick={() => void checkUpdate()} disabled={checking}>
            <RefreshCcw size={16} />
          </IconButton>
        ) : undefined
      }
      footer={
        <span className="update-dialog-footer-actions">
          {canInstall && (
            <Button variant="primary" onClick={() => void downloadAndInstall()} disabled={downloading}>
              <ArrowUpCircle size={15} />
              下载并安装
            </Button>
          )}
          {status === "downloading" && (
            <Button variant="primary" disabled>
              <ArrowUpCircle size={15} />
              更新中
            </Button>
          )}
          {status === "ready-to-restart" && (
            <Button variant="primary" onClick={() => void restart()}>
              <RotateCcw size={15} />
              重启完成更新
            </Button>
          )}
        </span>
      }
    >
      <div className="update-dialog-body">
        <div className="update-dialog-head">
          <span>
            <small>当前版本</small>
            <strong>{currentVersion || "读取中"}</strong>
          </span>
          <span>
            <small>最新版本</small>
            <strong>{updateInfo?.latestVersion ?? latestVersionFallback(status)}</strong>
          </span>
        </div>

        {updateInfo?.body && (
          <div className="update-release-notes">
            <span className="update-release-notes-title">
              <small>更新说明</small>
              {updateInfo.date && <small>{formatUpdateDate(updateInfo.date)}</small>}
            </span>
            <ul className="update-release-note-list">
              {formatReleaseNotes(updateInfo.body).map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {downloading && (
          <div className="update-progress-panel">
            <span className="update-progress-meta">
              <strong>{downloadProgress.percent === null ? "正在下载更新" : `正在下载更新 ${downloadProgress.percent}%`}</strong>
              <small>{downloadProgress.total ? formatBytes(downloadProgress.downloaded, downloadProgress.total) : "请保持 Workbench 打开，下载完成后会提示重启。"}</small>
            </span>
            <div className="update-progress-bar" aria-label="更新下载进度">
              <i style={{ width: `${downloadProgress.percent ?? 8}%` }} />
            </div>
          </div>
        )}

        {status === "ready-to-restart" && <div className="notice">更新已安装，重启 Workbench 后生效。请先保存当前工作。</div>}
        {status === "unsupported" && <div className="notice">Web 预览模式不支持应用更新，请在桌面应用中检查更新。</div>}
        {status === "current" && <div className="notice">当前已经是最新版本，可以稍后再次检查 GitHub Releases。</div>}
        {error && <div className="notice danger-notice">{error}</div>}
      </div>
    </Modal>
  );
}

function dialogDescription(status: string) {
  switch (status) {
    case "available":
      return "发现新版本，确认后再下载、安装并重启。";
    case "downloading":
      return "正在下载并安装更新。";
    case "ready-to-restart":
      return "更新已安装，重启后生效。";
    case "error":
      return "更新检查或安装遇到问题。";
    default:
      return "检查 GitHub Releases 中的最新版本。";
  }
}

function latestVersionFallback(status: string) {
  switch (status) {
    case "checking":
      return "检查中";
    case "current":
      return "已是最新";
    case "unsupported":
      return "不可用";
    default:
      return "尚未发现更新";
  }
}

export function formatReleaseNotes(body: string) {
  const lines = body
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => stripReleaseNoteMarker(line.trim()))
    .filter(Boolean);

  if (lines.length > 1) return lines;

  const source = lines[0] ?? body.trim();
  return source
    .split(/(?<=[。；;])\s*/)
    .map((item) => stripReleaseNoteMarker(item.trim()))
    .filter(Boolean);
}

function stripReleaseNoteMarker(line: string) {
  if (/^#+\s+/.test(line)) return "";
  return line.replace(/^([-*•]|\d+[.)、])\s+/, "");
}

function formatUpdateDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatBytes(downloaded: number, total: number) {
  return `${toMb(downloaded)} MB / ${toMb(total)} MB`;
}

function toMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1);
}

function updateStatusLabel(status: string) {
  switch (status) {
    case "checking":
      return "检查中";
    case "available":
      return "有更新";
    case "current":
      return "已是最新";
    case "downloading":
      return "更新中";
    case "ready-to-restart":
      return "待重启";
    case "error":
      return "检查失败";
    case "unsupported":
      return "不可用";
    default:
      return "未检查";
  }
}

function updateStatusTone(status: string): "neutral" | "accent" | "success" | "warning" | "danger" | "attention" {
  switch (status) {
    case "available":
      return "attention";
    case "current":
      return "success";
    case "downloading":
    case "checking":
      return "accent";
    case "ready-to-restart":
      return "warning";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}
