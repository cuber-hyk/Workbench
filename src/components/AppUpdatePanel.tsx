import { ArrowUpCircle, CheckCircle2, PlusCircle, RefreshCcw, RotateCcw, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppUpdate } from "../contexts/AppUpdateContext";
import { Button, IconButton, Modal, StatusBadge } from "./ui";

type ReleaseNoteSectionKey = "added" | "changed" | "fixed" | "security" | "other";

interface ReleaseNoteSection {
  key: ReleaseNoteSectionKey;
  title: string;
  items: string[];
}

const releaseSectionMeta: Record<ReleaseNoteSectionKey, { title: string; label: string; className: string; Icon: LucideIcon }> = {
  added: { title: "新增功能", label: "新增", className: "added", Icon: PlusCircle },
  changed: { title: "体验优化", label: "优化", className: "changed", Icon: Sparkles },
  fixed: { title: "问题修复", label: "修复", className: "fixed", Icon: Wrench },
  security: { title: "安全改进", label: "安全", className: "security", Icon: ShieldCheck },
  other: { title: "更新说明", label: "说明", className: "other", Icon: CheckCircle2 }
};

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
            <RefreshCcw className={checking ? "spin" : ""} size={15} />
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
  const releaseNotes = parseReleaseNotes(updateInfo?.body ?? "");

  return (
    <Modal
      title={status === "available" ? "发现新版本" : "软件更新"}
      description={dialogDescription(status)}
      onClose={onClose}
      large
      actions={
        status !== "downloading" && status !== "ready-to-restart" ? (
          <IconButton title={checking ? "检查中" : "检查更新"} onClick={() => void checkUpdate()} disabled={checking}>
            <RefreshCcw className={checking ? "spin" : ""} size={16} />
          </IconButton>
        ) : undefined
      }
      footer={
        <span className="update-dialog-footer-actions">
          <Button onClick={onClose}>稍后</Button>
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
        <div className="update-version-summary">
          <div>
            <small>当前版本</small>
            <strong>{currentVersion || "读取中"}</strong>
          </div>
          <div>
            <small>最新版本</small>
            <strong>{updateInfo?.latestVersion ? `Workbench v${updateInfo.latestVersion}` : latestVersionFallback(status)}</strong>
            {updateInfo?.date && <small>{formatUpdateDate(updateInfo.date)}</small>}
          </div>
          {releaseNotes.sections.length > 0 && (
            <div className="update-note-counts" aria-label="更新分类统计">
              {releaseNotes.sections.map((section) => {
                const meta = releaseSectionMeta[section.key];
                return <i key={section.key} className={meta.className}>{meta.label} {section.items.length}</i>;
              })}
            </div>
          )}
        </div>

        {updateInfo?.body && (
          <div className="update-release-notes">
            <span className="update-release-notes-title">
              <strong>{releaseNotes.versionTitle || "更新说明"}</strong>
              <small>结构化更新说明</small>
            </span>
            <div className="update-release-section-list">
              {releaseNotes.sections.map((section) => {
                const meta = releaseSectionMeta[section.key];
                const Icon = meta.Icon;
                return (
                  <section key={section.key} className={`update-release-section ${meta.className}`}>
                    <h3>
                      <span><Icon size={15} /></span>
                      {meta.title}
                    </h3>
                    <ul className="update-release-note-list">
                      {section.items.map((item, index) => (
                        <li key={`${section.key}-${index}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
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
  return parseReleaseNotes(body).sections.flatMap((section) => section.items);
}

export function parseReleaseNotes(body: string): { versionTitle: string; sections: ReleaseNoteSection[] } {
  const normalized = body.replace(/\r/g, "").trim();
  if (!normalized) return { versionTitle: "", sections: [] };

  const sections: ReleaseNoteSection[] = [];
  let versionTitle = "";
  let current: ReleaseNoteSection | null = null;

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const depth = heading[1].length;
      const text = stripInlineMarkdown(heading[2]);
      if (depth <= 2 && !versionTitle) {
        versionTitle = text;
        continue;
      }

      current = createReleaseNoteSection(text);
      sections.push(current);
      continue;
    }

    const item = stripReleaseNoteMarker(line);
    if (!item) continue;

    if (!current) {
      current = createReleaseNoteSection("Other");
      sections.push(current);
    }

    const splitItems = sections.length === 1 && current.items.length === 0 && !/^([-*•]|\d+[.)、])\s+/.test(line)
      ? splitSentenceNotes(item)
      : [item];
    current.items.push(...splitItems);
  }

  const nonEmptySections = sections.filter((section) => section.items.length > 0);
  return { versionTitle, sections: nonEmptySections };
}

function createReleaseNoteSection(title: string): ReleaseNoteSection {
  const key = releaseSectionKey(title);
  return {
    key,
    title: releaseSectionMeta[key].title,
    items: []
  };
}

function releaseSectionKey(title: string): ReleaseNoteSectionKey {
  const normalized = title.toLowerCase();
  if (normalized.includes("added") || normalized.includes("新增")) return "added";
  if (normalized.includes("changed") || normalized.includes("优化") || normalized.includes("变更") || normalized.includes("改进")) return "changed";
  if (normalized.includes("fixed") || normalized.includes("修复")) return "fixed";
  if (normalized.includes("security") || normalized.includes("安全")) return "security";
  return "other";
}

function stripReleaseNoteMarker(line: string) {
  return stripInlineMarkdown(line.replace(/^([-*•]|\d+[.)、])\s+/, "")).trim();
}

function splitSentenceNotes(source: string) {
  return source
    .split(/(?<=[。；;])\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripInlineMarkdown(source: string) {
  return source.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
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
