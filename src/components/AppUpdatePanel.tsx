import { ArrowUpCircle, RefreshCcw, RotateCcw } from "lucide-react";
import type { RefObject } from "react";
import { useAppUpdate } from "../contexts/AppUpdateContext";
import { Button, StatusBadge } from "./ui";

export function AppUpdatePanel({ focusRef }: { focusRef?: RefObject<HTMLElement> }) {
  const { status, currentVersion, updateInfo, error, checkUpdate, downloadAndInstall, restart } = useAppUpdate();
  const checking = status === "checking";
  const downloading = status === "downloading";
  const canInstall = status === "available" && updateInfo;

  return (
    <section className="settings-panel update-settings-panel" ref={focusRef} tabIndex={-1}>
      <div className="settings-panel-title">
        <span>
          <h2>软件更新</h2>
          <p>检查 GitHub Releases 中的最新版本，确认后再下载、安装并重启。</p>
        </span>
        <StatusBadge tone={updateStatusTone(status)}>{updateStatusLabel(status)}</StatusBadge>
      </div>

      <div className="update-version-grid">
        <div>
          <small>当前版本</small>
          <strong>{currentVersion || "读取中"}</strong>
        </div>
        <div>
          <small>最新版本</small>
          <strong>{updateInfo?.latestVersion ?? "尚未发现更新"}</strong>
        </div>
      </div>

      {updateInfo?.body && (
        <div className="update-release-notes">
          <small>更新说明</small>
          <p>{updateInfo.body}</p>
        </div>
      )}

      {error && <div className="notice danger-notice">{error}</div>}
      {status === "unsupported" && <div className="notice">Web 预览模式不支持应用更新，请在桌面应用中检查更新。</div>}
      {status === "ready-to-restart" && <div className="notice">更新已安装，重启 Workbench 后生效。</div>}

      <div className="settings-row update-action-row">
        <span>
          <strong>{updateActionTitle(status)}</strong>
          <small>{updateActionDescription(status)}</small>
        </span>
        <span className="settings-row-actions">
          <Button onClick={() => void checkUpdate()} disabled={checking || downloading}>
            <RefreshCcw size={15} />
            {checking ? "检查中" : "检查更新"}
          </Button>
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
      </div>
    </section>
  );
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

function updateActionTitle(status: string) {
  switch (status) {
    case "available":
      return "发现可用更新";
    case "current":
      return "当前已经是最新版本";
    case "downloading":
      return "正在下载并安装更新";
    case "ready-to-restart":
      return "重启后完成更新";
    case "error":
      return "更新检查遇到问题";
    default:
      return "手动检查更新";
  }
}

function updateActionDescription(status: string) {
  switch (status) {
    case "available":
      return "安装会在确认后进行，完成后需要重启应用。";
    case "current":
      return "可以稍后再次检查 GitHub Releases。";
    case "downloading":
      return "请保持应用打开，下载完成后会提示重启。";
    case "ready-to-restart":
      return "保存当前工作后再重启。";
    case "error":
      return "可检查网络、Release 配置或稍后重试。";
    default:
      return "启动后会静默检查，也可以在这里手动触发。";
  }
}
