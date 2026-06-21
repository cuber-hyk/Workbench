import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, FormEvent, ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpCircle,
  Ban,
  Box,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FolderOpen,
  MonitorUp,
  Moon,
  Pause,
  PackagePlus,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  Square,
  Star,
  Sun,
  Terminal,
  Trash2,
  X
} from "lucide-react";
import codexIcon from "./assets/tool-icons/codex.png";
import claudeCodeIcon from "./assets/tool-icons/claude-code.ico";
import opencodeIcon from "./assets/tool-icons/opencode.ico";
import devecoIcon from "./assets/tool-icons/deveco-code.ico";
import hermesIcon from "./assets/tool-icons/hermes-agent.png";
import kimiIcon from "./assets/tool-icons/kimi-code.ico";
import piIcon from "./assets/tool-icons/pi.svg";
import geminiIcon from "./assets/tool-icons/gemini-cli.png";
import qwenIcon from "./assets/tool-icons/qwen-code.png";
import gooseIcon from "./assets/tool-icons/goose.png";
import kiloIcon from "./assets/tool-icons/kilo-code.ico";
import clineIcon from "./assets/tool-icons/cline.png";
import rooIcon from "./assets/tool-icons/roo-code.png";
import factoryIcon from "./assets/tool-icons/factory-droid.ico";
import ampIcon from "./assets/tool-icons/amp.ico";
import kiroIcon from "./assets/tool-icons/kiro-cli.ico";
import junieIcon from "./assets/tool-icons/junie-cli.ico";
import { AppUpdateDialog, AppUpdatePanel } from "./components/AppUpdatePanel";
import { UpdateBadge } from "./components/UpdateBadge";
import { ActionGroup, Button, ConfirmDeleteModal, DetailHeader, FilterMore, IconButton, Modal, PageHeader, Panel, SearchInput, StatusBadge, TagList, Toolbar } from "./components/ui";
import { useAppUpdate } from "./contexts/AppUpdateContext";
import { workbenchApi } from "./lib/api/workbenchApi";
import type { AppSettings, CloseBehavior, CustomToolTargetInput, ImportResult, LaunchRun, LaunchSession, LaunchSessionEvent, LaunchSessionSnapshot, Project, ProjectLaunchConfig, ProjectOpenProfile, RadarCategory, RadarDuplicateGroup, RadarItem, Skill, SkillCategory, SkillMarketDetail, SkillMarketItem, SkillUpdateResult, SkillUpdateState, SkillUpdateStatus, SkillVersionSource, ToolKey, ToolTarget, ViewKey } from "./lib/types/domain";

const views: Array<{ key: ViewKey; label: string; icon: JSX.Element }> = [
  { key: "projects", label: "项目", icon: <Box size={16} /> },
  { key: "skills", label: "Skills", icon: <Sparkles size={16} /> },
  { key: "radar", label: "资源 Radar", icon: <CircleDot size={16} /> },
  { key: "settings", label: "设置", icon: <Settings size={16} /> }
];

const radarDomains = ["未分类", "Skills", "Agent", "RAG", "AI 基础", "开发工具", "文档工具", "算法与数据结构", "教程与资源", "前端开发", "Android 开发", "桌面应用", "音视频工具", "安全与网络", "其他"];
const updateNoticeStorageKey = "workbench-update-notice-version";
let skillMarketRuntimeCache: { items: SkillMarketItem[]; updatedAt: number } | null = null;
const toolIconSources: Record<string, string> = {
  codex: codexIcon,
  claude: claudeCodeIcon,
  opencode: opencodeIcon,
  deveco: devecoIcon,
  hermes: hermesIcon,
  kimi: kimiIcon,
  pi: piIcon,
  gemini: geminiIcon,
  qwen: qwenIcon,
  goose: gooseIcon,
  kilo: kiloIcon,
  cline: clineIcon,
  roo: rooIcon,
  factory: factoryIcon,
  amp: ampIcon,
  kiro: kiroIcon,
  junie: junieIcon
};

type ToastState = {
  message: string;
  tone: "neutral" | "success" | "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
};

type MarketInstallTask = {
  key: string;
  source: string;
  skillId: string;
  progress: number;
  status: "running" | "succeeded" | "failed";
  error?: string;
};

export function App() {
  return (
    <AppErrorBoundary>
      <WorkbenchApp />
    </AppErrorBoundary>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Workbench render failed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="view">
          <div className="notice compact-empty" role="alert">
            <strong>页面渲染失败</strong>
            <small>{this.state.error}</small>
            <Button onClick={() => window.location.reload()}><RefreshCcw size={15} />重新加载</Button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

function WorkbenchApp() {
  const { hasUpdate, updateInfo } = useAppUpdate();
  const [activeView, setActiveView] = useState<ViewKey>("projects");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("workbench-theme") as "light" | "dark") || "light";
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillCategories, setSkillCategories] = useState<SkillCategory[]>([]);
  const [radarItems, setRadarItems] = useState<RadarItem[]>([]);
  const [radarDuplicateGroups, setRadarDuplicateGroups] = useState<RadarDuplicateGroup[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("workbench");
  const [selectedSkillId, setSelectedSkillId] = useState("security-review");
  const [selectedRadarId, setSelectedRadarId] = useState("mcp");
  const [projectLaunchTimes, setProjectLaunchTimes] = useState<Record<string, string>>({});
  const [launchRuns, setLaunchRuns] = useState<Record<string, LaunchRun>>({});
  const pendingLaunchEventsRef = useRef<Record<string, LaunchSessionEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [activeDialog, setActiveDialog] = useState<"project" | "project-open-profile" | "project-open-profile-delete" | "custom-tool" | "custom-tool-delete" | "skills-import" | "skill-delete" | "skill-categories" | "radar" | "radar-delete" | "app-update" | "create-directory" | "tray-hint" | null>(null);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editingProjectOpenProfileId, setEditingProjectOpenProfileId] = useState("");
  const [deleteProjectOpenProfileId, setDeleteProjectOpenProfileId] = useState("");
  const [editingCustomToolKey, setEditingCustomToolKey] = useState("");
  const [deleteCustomToolKey, setDeleteCustomToolKey] = useState("");
  const [editingRadarId, setEditingRadarId] = useState("");
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [deleteSkillId, setDeleteSkillId] = useState("");
  const [createDirectoryPath, setCreateDirectoryPath] = useState("");
  const [syncingGithubStars, setSyncingGithubStars] = useState(false);
  const [marketInstallTask, setMarketInstallTask] = useState<MarketInstallTask | null>(null);
  const marketInstallRunningRef = useRef(false);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("workbench-theme", theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const openUpdateDialog = useCallback(() => {
    setActiveDialog("app-update");
  }, []);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window) || !settings) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void handleWindowCloseRequest();
    }).then((listener) => {
      unlisten = listener;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [settings?.closeBehavior]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      workbenchApi.listProjects().then(setProjects),
      workbenchApi.getSkillsState().then((state) => {
        setSkills(state.skills);
        setSkillCategories(state.categories);
        setSettings(state.settings);
      }),
      workbenchApi.listRadarItems().then(setRadarItems),
      workbenchApi.listRadarDuplicateGroups().then(setRadarDuplicateGroups)
    ])
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        showToast(message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void workbenchApi.subscribeLaunchEvents((rawEvent) => {
      const event = normalizeLaunchSessionEvent(rawEvent);
      setLaunchRuns((current) => {
        const entry = Object.entries(current).find(([, launchRun]) => launchRun.id === event.launchRunId);
        if (!entry) {
          pendingLaunchEventsRef.current[event.launchRunId] = [
            ...(pendingLaunchEventsRef.current[event.launchRunId] ?? []),
            event
          ];
          return current;
        }
        const [projectId, launchRun] = entry;
        return {
          ...current,
          [projectId]: applyLaunchSessionEvent(launchRun, event) ?? launchRun
        };
      });
    }).then((listener) => {
      unsubscribe = listener;
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const activeProjects = projects.filter((project) => !project.archived);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? activeProjects[0] ?? projects[0];
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? skills[0];
  const deleteSkill = skills.find((skill) => skill.id === deleteSkillId) ?? selectedSkill;
  const projectOpenProfiles = settings?.projectOpenProfiles ?? [];
  const toolTargets = settings?.toolTargets ?? [];
  const editingProjectOpenProfile = projectOpenProfiles.find((profile) => profile.id === editingProjectOpenProfileId);
  const deletingProjectOpenProfile = projectOpenProfiles.find((profile) => profile.id === deleteProjectOpenProfileId);
  const editingCustomTool = toolTargets.find((tool) => tool.key === editingCustomToolKey && tool.source === "custom");
  const deletingCustomTool = toolTargets.find((tool) => tool.key === deleteCustomToolKey && tool.source === "custom");
  const selectedRadar = radarItems.find((item) => item.id === selectedRadarId) ?? radarItems[0];

  function showToast(message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number; tone?: ToastState["tone"] }) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, tone: options?.tone ?? "neutral", actionLabel: options?.actionLabel, onAction: options?.onAction });
    toastTimerRef.current = window.setTimeout(() => setToast(null), options?.duration ?? 1800);
  }

  async function executeCloseBehavior(behavior: CloseBehavior) {
    if (behavior === "hide_to_tray") {
      await workbenchApi.hideMainWindow();
      return;
    }
    await workbenchApi.exitApp();
  }

  async function handleWindowCloseRequest() {
    if (!settings) return;
    if (settings.closeBehavior === "exit") {
      try {
        await executeCloseBehavior("exit");
      } catch (error) {
        showToast(String(error));
      }
      return;
    }
    if (!settings.closeTrayHintDismissed) {
      setActiveDialog("tray-hint");
      return;
    }
    try {
      await executeCloseBehavior("hide_to_tray");
    } catch (error) {
      showToast(String(error));
    }
  }

  async function confirmTrayHint() {
    try {
      const state = await workbenchApi.setCloseTrayHintDismissed(true);
      setSettings(state.settings);
      setSkills(state.skills);
      setSkillCategories(state.categories);
      setActiveDialog(null);
      await executeCloseBehavior("hide_to_tray");
    } catch (error) {
      showToast(String(error));
    }
  }

  useEffect(() => {
    if (!hasUpdate || !updateInfo?.latestVersion || !shouldShowUpdateNotice(updateInfo.latestVersion)) return;

    rememberUpdateNotice(updateInfo.latestVersion);
    showToast(`发现新版本 ${updateInfo.latestVersion}`, {
      actionLabel: "查看更新",
      onAction: openUpdateDialog,
      duration: 5000
    });
  }, [hasUpdate, openUpdateDialog, updateInfo?.latestVersion]);

  function runToastAction(currentToast: ToastState) {
    dismissToast();
    currentToast.onAction?.();
  }

  function dismissToast() {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }

  async function refreshSkills() {
    const state = await workbenchApi.getSkillsState();
    setSkills(state.skills);
    setSkillCategories(state.categories);
    setSettings(state.settings);
    if (!state.skills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(state.skills[0]?.id ?? "");
    }
  }

  async function runSkillAction(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      await refreshSkills();
      showToast(success);
    } catch (error) {
      showToast(String(error));
    }
  }

  async function installMarketSkill(item: SkillMarketItem) {
    if (marketInstallRunningRef.current) return;
    marketInstallRunningRef.current = true;
    const key = `${item.source}/${item.skillId}`;
    setMarketInstallTask({
      key,
      source: item.source,
      skillId: item.skillId,
      progress: 8,
      status: "running"
    });
    try {
      const state = await workbenchApi.installSkillFromMarket(item.source, item.skillId, (progress) => {
        setMarketInstallTask((current) =>
          current?.key === key ? { ...current, progress, status: "running" } : current
        );
      });
      setSkills(state.skills);
      setSkillCategories(state.categories);
      setSettings(state.settings);
      if (!state.skills.some((skill) => skill.id === selectedSkillId)) {
        setSelectedSkillId(state.skills[0]?.id ?? "");
      }
      skillMarketRuntimeCache = null;
      setMarketInstallTask((current) =>
        current?.key === key ? { ...current, progress: 100, status: "succeeded" } : current
      );
      showToast("Skill 已安装", { tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMarketInstallTask((current) =>
        current?.key === key ? { ...current, status: "failed", error: message } : current
      );
      showToast("Skill 安装失败，请在技能市场查看详情", { tone: "danger", duration: 3600 });
    } finally {
      marketInstallRunningRef.current = false;
    }
  }

  async function openPathOrPromptCreate(path: string) {
    try {
      await workbenchApi.openLocalPath(path);
    } catch (error) {
      const message = String(error);
      if (message.includes("路径不存在")) {
        setCreateDirectoryPath(path);
        setActiveDialog("create-directory");
        return;
      }
      showToast(message);
    }
  }

  function openProjectDialog(projectId = "") {
    setEditingProjectId(projectId);
    setActiveDialog("project");
  }

  async function saveProject(project: Project) {
    try {
      const nextProjects = await workbenchApi.saveProject(project);
      setProjects(nextProjects);
      setSelectedProjectId(project.id);
      setActiveDialog(null);
      setEditingProjectId("");
      showToast(editingProjectId ? "项目已更新" : "项目已添加");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function openProjectWithProfile(project: Project, profile: ProjectOpenProfile) {
    try {
      await workbenchApi.openProjectWithProfile(project, profile);
      showToast(`正在用 ${profile.name} 打开项目`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveProjectOpenProfile(profile: ProjectOpenProfile) {
    try {
      const nextProfiles = await workbenchApi.saveProjectOpenProfile(profile);
      setSettings((current) => current ? { ...current, projectOpenProfiles: nextProfiles } : current);
      setActiveDialog(null);
      setEditingProjectOpenProfileId("");
      showToast(editingProjectOpenProfileId ? "打开方式已更新" : "打开方式已添加");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteProjectOpenProfile(profile: ProjectOpenProfile) {
    try {
      const nextProfiles = await workbenchApi.deleteProjectOpenProfile(profile.id);
      setSettings((current) => current ? { ...current, projectOpenProfiles: nextProfiles } : current);
      setActiveDialog(null);
      setDeleteProjectOpenProfileId("");
      showToast("打开方式已删除");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  function saveCustomToolTarget(input: CustomToolTargetInput) {
    void runSkillAction(async () => {
      await workbenchApi.saveCustomToolTarget(input);
      setActiveDialog(null);
      setEditingCustomToolKey("");
    }, editingCustomToolKey ? "自定义工具已更新" : "自定义工具已添加");
  }

  function deleteCustomToolTarget() {
    if (!deleteCustomToolKey) return;
    void runSkillAction(async () => {
      await workbenchApi.deleteCustomToolTarget(deleteCustomToolKey);
      setActiveDialog(null);
      setDeleteCustomToolKey("");
    }, "自定义工具已删除");
  }

  async function saveRadarItem(item: RadarItem) {
    try {
      const nextItems = await workbenchApi.saveRadarItem(item);
      setRadarItems(nextItems);
      setRadarDuplicateGroups(await workbenchApi.listRadarDuplicateGroups());
      setSelectedRadarId(item.id);
      setActiveDialog(null);
      setEditingRadarId("");
      showToast(editingRadarId ? "资源条目已更新" : "资源条目已添加");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteRadarItem(item: RadarItem) {
    try {
      const nextItems = await workbenchApi.deleteRadarItem(item.id);
      setRadarItems(nextItems);
      setRadarDuplicateGroups(await workbenchApi.listRadarDuplicateGroups());
      setSelectedRadarId(nextItems[0]?.id ?? "");
      setActiveDialog(null);
      showToast("资源条目已删除");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function toggleRadarFavorite(item: RadarItem) {
    try {
      const nextItems = await workbenchApi.saveRadarItem({ ...item, favorite: !item.favorite });
      setRadarItems(nextItems);
      showToast(item.favorite ? "已取消收藏" : "已收藏");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function syncGithubStars() {
    setSyncingGithubStars(true);
    try {
      const cliStatus = await workbenchApi.checkGithubCliStatus();
      if (cliStatus.status !== "ready") {
        showToast(cliStatus.message, { duration: 4200, tone: "warning" });
        return;
      }
      const result = await workbenchApi.syncGithubStars();
      setRadarItems(result.items);
      setRadarDuplicateGroups(await workbenchApi.listRadarDuplicateGroups());
      showToast(`GitHub Stars 同步完成：新增 ${result.added}，更新 ${result.updated}，失效 ${result.deactivated}，未变化 ${result.unchanged}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { duration: 4200, tone: "danger" });
    } finally {
      setSyncingGithubStars(false);
    }
  }

  async function mergeRadarDuplicateGroup(groupId: string, primaryItemId: string) {
    try {
      const nextItems = await workbenchApi.mergeRadarDuplicateGroup(groupId, primaryItemId);
      setRadarItems(nextItems);
      setRadarDuplicateGroups(await workbenchApi.listRadarDuplicateGroups());
      setSelectedRadarId(primaryItemId);
      showToast("重复来源已合并");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <strong>Workbench</strong>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {views.map((view) => (
            <button
              key={view.key}
              className={`nav-item ${activeView === view.key ? "active" : ""}`}
              onClick={() => setActiveView(view.key)}
            >
              {view.icon}
              {view.label}
            </button>
          ))}
        </nav>

        <section className="local-strip" aria-label="本机工作区状态">
          <strong>本机工作区</strong>
          <div>
            <span>
              <b>SQLite</b>
              <small>本地数据</small>
            </span>
            <span>
              <b>Auto</b>
              <small>Skills 启用</small>
            </span>
            <span>
              <b>Tauri</b>
              <small>桌面壳</small>
            </span>
          </div>
        </section>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {theme === "dark" ? "深色主题" : "浅色主题"}
          </button>
          <UpdateBadge
            onClick={openUpdateDialog}
          />
          <div className="local-status">
            <span className="status-dot" />
            <span>本地模式</span>
          </div>
        </div>
      </aside>

      <main className="main">
        {activeView === "projects" && (
          <ProjectsView
            projects={projects}
            selectedProject={selectedProject}
            projectLaunchTimes={projectLaunchTimes}
            launchRuns={launchRuns}
            projectOpenProfiles={settings?.projectOpenProfiles ?? []}
            loading={loading}
            loadError={loadError}
            onSelect={setSelectedProjectId}
            onOpenWithProfile={(project, profile) => void openProjectWithProfile(project, profile)}
            onLaunch={async (project) => {
              try {
                const nextLaunchRun = await workbenchApi.launchProject(project);
                const startedAt = formatLaunchTime(new Date());
                const visibleLaunchRun = { ...nextLaunchRun, startedAt };
                setLaunchRuns((current) => ({
                  ...current,
                  [project.id]: applyPendingLaunchEvents(visibleLaunchRun, pendingLaunchEventsRef.current)
                }));
                setProjectLaunchTimes((times) => ({ ...times, [project.id]: startedAt }));
                const count = enabledLaunchConfigs(project).length;
                showToast(`已启动 ${project.name} 的 ${count} 个会话`);
              } catch (error) {
                showToast(error instanceof Error ? error.message : String(error));
              }
            }}
            onStopLaunchSession={async (sessionId) => {
              try {
                await workbenchApi.stopLaunchSession(sessionId);
                setLaunchRuns((current) => markLaunchSessionStoppedInRuns(current, sessionId));
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (isAlreadyEndedLaunchMessage(message)) {
                  setLaunchRuns((current) => markLaunchSessionStoppedInRuns(current, sessionId));
                  showToast("启动会话已结束");
                } else {
                  showToast(message);
                }
              }
            }}
            onStopLaunchRun={async (launchRunId) => {
              try {
                await workbenchApi.stopLaunchRun(launchRunId);
                setLaunchRuns((current) => markLaunchRunStoppedInRuns(current, launchRunId));
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (isAlreadyEndedLaunchMessage(message)) {
                  setLaunchRuns((current) => markLaunchRunStoppedInRuns(current, launchRunId));
                  showToast("启动会话已结束");
                } else {
                  showToast(message);
                }
              }
            }}
            onRestartLaunchSession={async (session) => {
              try {
                const nextSession = await workbenchApi.restartLaunchSession(session);
                setLaunchRuns((current) => replaceLaunchSessionInRuns(current, nextSession));
              } catch (error) {
                showToast(error instanceof Error ? error.message : String(error));
              }
            }}
            onSyncLaunchRun={async (launchRunId) => {
              try {
                const snapshots = await workbenchApi.getLaunchRunSnapshot(launchRunId);
                setLaunchRuns((current) => mergeLaunchRunSnapshotsInRuns(current, launchRunId, snapshots));
              } catch (error) {
                showToast(error instanceof Error ? error.message : String(error));
              }
            }}
            onOpenLogUrl={async (url) => {
              try {
                await workbenchApi.openRadarLink(url);
              } catch (error) {
                showToast(error instanceof Error ? error.message : String(error));
              }
            }}
            onClearLaunchRun={(projectId) => {
              setLaunchRuns((current) => {
                const { [projectId]: _removed, ...remaining } = current;
                return remaining;
              });
            }}
            onEdit={(project) => openProjectDialog(project.id)}
            onArchive={(project, archived) => {
              if (archived && isProjectRunning(project.id, launchRuns)) {
                showToast("运行中的项目不能归档，请先停止启动会话");
                return;
              }
              void saveProject({ ...project, archived });
            }}
            onAdd={() => openProjectDialog()}
          />
        )}
        {activeView === "skills" && selectedSkill && settings && (
          <SkillsView
            skills={skills}
            selectedSkill={selectedSkill}
            categories={skillCategories}
            settings={settings}
            projects={activeProjects}
            onSelect={setSelectedSkillId}
            onImport={async (kind) => {
              try {
                const source = await workbenchApi.selectSkillImportSource(kind);
                if (!source) return;
                const results =
                  kind === "zip"
                    ? await workbenchApi.importSkillsFromZip(source)
                    : await workbenchApi.importSkillsFromFolder(source);
                setImportResults(results);
                setActiveDialog("skills-import");
                await refreshSkills();
              } catch (error) {
                showToast(String(error));
              }
            }}
            onRefresh={() => void runSkillAction(refreshSkills, "Skills 已重新扫描")}
            marketInstallTask={marketInstallTask}
            onInstallMarketSkill={(item) => void installMarketSkill(item)}
            onManageCategories={() => setActiveDialog("skill-categories")}
            onToggle={(tool, enabled, project) =>
              void runSkillAction(
                () =>
                  workbenchApi.setSkillEnabled(
                    selectedSkill.directoryName,
                    tool,
                    enabled,
                    project ? "project" : "global",
                    project?.name,
                    project?.path
                  ),
                enabled ? "Skill 已启用" : "Skill 已停用"
              )
            }
            onToggleSkillGlobal={(directoryName, tool, enabled) =>
              void runSkillAction(
                () => workbenchApi.setSkillEnabled(directoryName, tool, enabled, "global"),
                enabled ? "Skill 已启用" : "Skill 已停用"
              )
            }
            onToggleProjectAll={(project, enabled) =>
              void runSkillAction(
                () =>
                  Promise.all(
                    settings.toolTargets
                      .filter((tool) => tool.supportsProjectScope)
                      .filter((tool) => {
                        const isEnabled = selectedSkill.enabledProjects.some(
                          (entry) => entry.projectPath === project.path && entry.tool === tool.key
                        );
                        return enabled ? !isEnabled : isEnabled;
                      })
                      .map((tool) =>
                        workbenchApi.setSkillEnabled(
                          selectedSkill.directoryName,
                          tool.key,
                          enabled,
                          "project",
                          project.name,
                          project.path
                        )
                      )
                  ),
                enabled ? "项目工具已全部启用" : "项目工具已全部关闭"
              )
            }
            onCategorySkill={(directoryName, categoryId) =>
              void runSkillAction(
                () => workbenchApi.setSkillCategory(directoryName, categoryId),
                "分类已更新"
              )
            }
            onCreateCategorySkill={(directoryName, name) =>
              void runSkillAction(
                async () => {
                  const state = await workbenchApi.createSkillCategory(name);
                  const category = state.categories.find((item) => item.name === name.trim());
                  if (!category) throw new Error("分类创建后未找到");
                  await workbenchApi.setSkillCategory(directoryName, category.id);
                },
                "分类已创建"
              )
            }
            onResolve={(source) =>
              void runSkillAction(
                () =>
                  workbenchApi.resolveSkillConflict(
                    selectedSkill.directoryName,
                    source
                  ),
                "冲突已统一解决并完成备份"
              )
            }
            onDeleteSkill={(skillId) => {
              setDeleteSkillId(skillId);
              setActiveDialog("skill-delete");
            }}
          />
        )}
        {activeView === "skills" && (!selectedSkill || !settings) && (
          <ModuleStateView
            title="Skills"
            description="管理统一根目录中的 Skills"
            loading={loading}
            error={loadError}
            emptyTitle="暂无 Skills"
            emptyDescription="配置统一根目录并扫描后，可以在这里管理 Skills。"
          />
        )}
        {activeView === "radar" && (
          <RadarView
            items={radarItems}
            duplicateGroups={radarDuplicateGroups}
            selectedItem={selectedRadar}
            loading={loading}
            loadError={loadError}
            onSelect={setSelectedRadarId}
            onAdd={() => {
              setEditingRadarId("");
              setActiveDialog("radar");
            }}
            onEdit={(item) => {
              setEditingRadarId(item.id);
              setActiveDialog("radar");
            }}
            onDelete={() => setActiveDialog("radar-delete")}
            onToggleFavorite={(item) => void toggleRadarFavorite(item)}
            onOpenLink={(url) => void workbenchApi.openRadarLink(url).catch((error) => showToast(String(error)))}
            syncingGithubStars={syncingGithubStars}
            onSyncGithubStars={() => void syncGithubStars()}
            onMergeDuplicateGroup={(groupId, primaryItemId) => void mergeRadarDuplicateGroup(groupId, primaryItemId)}
          />
        )}
        {activeView === "settings" && settings && (
          <SettingsView
            settings={settings}
            theme={theme}
            onOpenUpdateDetails={openUpdateDialog}
            onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
            onRootChange={(path) => void runSkillAction(() => workbenchApi.setSkillsRoot(path), "Skills 根目录已更新")}
            onReorderToolTargets={(toolKeys) => void runSkillAction(() => workbenchApi.setToolTargetOrder(toolKeys), "工具展示顺序已更新")}
            onAddCustomTool={() => {
              setEditingCustomToolKey("");
              setActiveDialog("custom-tool");
            }}
            onEditCustomTool={(tool) => {
              setEditingCustomToolKey(tool.key);
              setActiveDialog("custom-tool");
            }}
            onDeleteCustomTool={(tool) => {
              setDeleteCustomToolKey(tool.key);
              setActiveDialog("custom-tool-delete");
            }}
            onCloseBehaviorChange={(behavior) => void runSkillAction(() => workbenchApi.setCloseBehavior(behavior), "关闭窗口行为已更新")}
            onOpenPath={(path) => void openPathOrPromptCreate(path)}
            onAddProjectOpenProfile={() => {
              setEditingProjectOpenProfileId("");
              setActiveDialog("project-open-profile");
            }}
            onEditProjectOpenProfile={(profile) => {
              setEditingProjectOpenProfileId(profile.id);
              setActiveDialog("project-open-profile");
            }}
            onDeleteProjectOpenProfile={(profile) => {
              setDeleteProjectOpenProfileId(profile.id);
              setActiveDialog("project-open-profile-delete");
            }}
          />
        )}
        {activeView === "settings" && !settings && (
          <ModuleStateView
            title="设置"
            description="管理本地路径、工具目录与主题"
            loading={loading}
            error={loadError}
            emptyTitle="设置暂不可用"
            emptyDescription="等待本地设置读取完成后再试。"
          />
        )}
      </main>

      {toast && (
        <div className={`toast show toast-${toast.tone} ${toast.onAction ? "actionable" : ""}`} role="status">
          <span className="toast-icon" aria-hidden="true">{toastIcon(toast.tone)}</span>
          <span className="toast-message">{formatToastMessage(toast.message)}</span>
          {toast.onAction && (
            <button type="button" onClick={() => runToastAction(toast)}>
              {toast.actionLabel ?? "查看"}
            </button>
          )}
          <button type="button" className="toast-close" aria-label="关闭通知" onClick={dismissToast}>
            <X size={15} />
          </button>
        </div>
      )}
      {activeDialog === "app-update" && <AppUpdateDialog onClose={() => setActiveDialog(null)} />}
      {activeDialog === "tray-hint" && (
        <TrayHintDialog
          onClose={() => setActiveDialog(null)}
          onConfirm={() => void confirmTrayHint()}
        />
      )}
      {activeDialog === "create-directory" && (
        <CreateDirectoryDialog
          path={createDirectoryPath}
          onClose={() => {
            setActiveDialog(null);
            setCreateDirectoryPath("");
          }}
          onConfirm={() => {
            const path = createDirectoryPath;
            setActiveDialog(null);
            setCreateDirectoryPath("");
            void runSkillAction(() => workbenchApi.createAndOpenDirectory(path), "目录已创建");
          }}
        />
      )}
      {activeDialog === "project" && (
        <ProjectDialog
          project={projects.find((project) => project.id === editingProjectId)}
          onSelectDirectory={() => workbenchApi.selectDirectory()}
          onError={showToast}
          onSubmit={saveProject}
          onClose={() => {
            setActiveDialog(null);
            setEditingProjectId("");
          }}
        />
      )}
      {activeDialog === "skills-import" && (
        <SkillsImportDialog
          results={importResults}
          skillsRoot={settings?.skillsRoot ?? ""}
          onClose={() => {
            setActiveDialog(null);
            setImportResults([]);
          }}
        />
      )}
      {activeDialog === "skill-delete" && deleteSkill && (
        <DeleteSkillDialog
          skill={deleteSkill}
          onClose={() => {
            setActiveDialog(null);
            setDeleteSkillId("");
          }}
          onConfirm={() => {
            setActiveDialog(null);
            const target = deleteSkill;
            setDeleteSkillId("");
            void runSkillAction(() => workbenchApi.deleteSkill(target.directoryName), "Skill 已删除");
          }}
        />
      )}
      {activeDialog === "skill-categories" && (
        <SkillCategoryDialog
          categories={skillCategories}
          onClose={() => setActiveDialog(null)}
          onCreate={(name) => void runSkillAction(() => workbenchApi.createSkillCategory(name), "分类已创建")}
          onRename={(categoryId, name) => void runSkillAction(() => workbenchApi.renameSkillCategory(categoryId, name), "分类已重命名")}
          onDelete={(categoryId, replacementCategoryId) => void runSkillAction(() => workbenchApi.deleteSkillCategory(categoryId, replacementCategoryId), "分类已删除")}
          onMerge={(sourceCategoryId, targetCategoryId) => void runSkillAction(() => workbenchApi.mergeSkillCategory(sourceCategoryId, targetCategoryId), "分类已合并")}
        />
      )}
      {activeDialog === "project-open-profile" && settings && (
        <ProjectOpenProfileDialog
          profile={editingProjectOpenProfile}
          nextSortOrder={settings.projectOpenProfiles.length}
          onSelectExecutable={() => workbenchApi.selectProjectOpenExecutable()}
          onError={showToast}
          onSubmit={saveProjectOpenProfile}
          onClose={() => {
            setActiveDialog(null);
            setEditingProjectOpenProfileId("");
          }}
        />
      )}
      {activeDialog === "project-open-profile-delete" && deletingProjectOpenProfile && (
        <DeleteProjectOpenProfileDialog
          profile={deletingProjectOpenProfile}
          onClose={() => {
            setActiveDialog(null);
            setDeleteProjectOpenProfileId("");
          }}
          onConfirm={() => void deleteProjectOpenProfile(deletingProjectOpenProfile)}
        />
      )}
      {activeDialog === "custom-tool" && (
        <CustomToolDialog
          tool={editingCustomTool}
          existingTools={settings?.toolTargets ?? []}
          onSelectDirectory={() => workbenchApi.selectDirectory()}
          onSelectIcon={() => workbenchApi.selectToolIconSource()}
          onError={showToast}
          onSubmit={saveCustomToolTarget}
          onClose={() => {
            setActiveDialog(null);
            setEditingCustomToolKey("");
          }}
        />
      )}
      {activeDialog === "custom-tool-delete" && deletingCustomTool && (
        <DeleteCustomToolDialog
          tool={deletingCustomTool}
          onClose={() => {
            setActiveDialog(null);
            setDeleteCustomToolKey("");
          }}
          onConfirm={deleteCustomToolTarget}
        />
      )}
      {activeDialog === "radar" && (
        <RadarDialog
          item={radarItems.find((item) => item.id === editingRadarId)}
          onSubmit={saveRadarItem}
          onClose={() => {
            setActiveDialog(null);
            setEditingRadarId("");
          }}
        />
      )}
      {activeDialog === "radar-delete" && selectedRadar && (
        <DeleteRadarDialog
          item={selectedRadar}
          onClose={() => setActiveDialog(null)}
          onConfirm={() => void deleteRadarItem(selectedRadar)}
        />
      )}
    </div>
  );
}

export function shouldShowUpdateNotice(latestVersion: string, storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    return storage.getItem(updateNoticeStorageKey) !== latestVersion;
  } catch {
    return true;
  }
}

export function rememberUpdateNotice(latestVersion: string, storage: Pick<Storage, "setItem"> = localStorage) {
  try {
    storage.setItem(updateNoticeStorageKey, latestVersion);
  } catch {
    // 更新提醒记录只影响是否重复 toast，失败时不阻断更新检查。
  }
}

export function ModuleStateView({
  title,
  description,
  loading,
  error,
  emptyTitle,
  emptyDescription
}: {
  title: string;
  description: string;
  loading: boolean;
  error: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section className="view">
      <PageHeader title={title} description={description} />
      <Panel className="state-panel">
        <div className="empty-state detail-empty">
          <strong>{loading ? "正在加载" : error ? "加载失败" : emptyTitle}</strong>
          <small>{loading ? "正在读取 Workbench 本地数据。" : error || emptyDescription}</small>
        </div>
      </Panel>
    </section>
  );
}

export function ProjectsView({
  projects,
  selectedProject,
  projectLaunchTimes,
  launchRuns,
  launchRun,
  projectOpenProfiles = [],
  loading,
  loadError,
  onSelect,
  onOpenWithProfile,
  onLaunch,
  onStopLaunchSession = () => undefined,
  onStopLaunchRun = () => undefined,
  onRestartLaunchSession = () => undefined,
  onSyncLaunchRun = () => undefined,
  onOpenLogUrl = () => undefined,
  onClearLaunchRun = () => undefined,
  onEdit,
  onArchive,
  onAdd
}: {
  projects: Project[];
  selectedProject?: Project;
  projectLaunchTimes: Record<string, string>;
  launchRuns?: Record<string, LaunchRun>;
  launchRun?: LaunchRun | null;
  projectOpenProfiles?: ProjectOpenProfile[];
  loading: boolean;
  loadError: string;
  onSelect: (id: string) => void;
  onOpenWithProfile?: (project: Project, profile: ProjectOpenProfile) => void;
  onLaunch: (project: Project) => void;
  onStopLaunchSession?: (sessionId: string) => void;
  onStopLaunchRun?: (launchRunId: string) => void;
  onRestartLaunchSession?: (session: LaunchSession) => void;
  onSyncLaunchRun?: (launchRunId: string) => void;
  onOpenLogUrl?: (url: string) => void;
  onClearLaunchRun?: (projectId: string) => void;
  onEdit: (project: Project) => void;
  onArchive: (project: Project, archived: boolean) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("全部标签");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [archiveFilter, setArchiveFilter] = useState("活跃项目");
  const [launchLogProjectId, setLaunchLogProjectId] = useState("");
  const tagOptions = useMemo(
    () => ["全部标签", ...Array.from(new Set(projects.flatMap((project) => project.tags)))],
    [projects]
  );
  const currentLaunchRuns = launchRuns ?? (launchRun ? { [launchRun.projectId]: launchRun } : {});
  const launchLogProject = projects.find((project) => project.id === launchLogProjectId);
  const launchLogRun = launchLogProject ? currentLaunchRuns[launchLogProject.id] ?? null : null;
  const selectedProjectRunning = selectedProject ? isProjectRunning(selectedProject.id, currentLaunchRuns) : false;
  const visibleProjects = projects.filter((project) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery
      || project.name.toLowerCase().includes(normalizedQuery)
      || project.path.toLowerCase().includes(normalizedQuery);
    const matchesTag = tagFilter === "全部标签" || project.tags.includes(tagFilter);
    const status = getProjectLaunchStatus(project, projectLaunchTimes, currentLaunchRuns[project.id]);
    const matchesStatus = statusFilter === "全部状态" || status === statusFilter;
    const matchesArchive =
      archiveFilter === "全部项目" ||
      (archiveFilter === "活跃项目" && !project.archived) ||
      (archiveFilter === "已归档" && project.archived);
    return matchesQuery && matchesTag && matchesStatus && matchesArchive;
  });
  const selectedLaunchRun = selectedProject ? currentLaunchRuns[selectedProject.id] ?? null : null;

  if (launchLogProject && launchLogRun) {
    return (
      <LaunchLogDetailPage
        project={launchLogProject}
        launchRun={launchLogRun}
        onBack={() => setLaunchLogProjectId("")}
        onLaunch={onLaunch}
        onStopLaunchSession={onStopLaunchSession}
        onStopLaunchRun={onStopLaunchRun}
        onRestartLaunchSession={onRestartLaunchSession}
        onSyncLaunchRun={onSyncLaunchRun}
        onOpenLogUrl={onOpenLogUrl}
        onClearLaunchRun={() => {
          onClearLaunchRun(launchLogProject.id);
          setLaunchLogProjectId("");
        }}
      />
    );
  }

  return (
    <section className="view">
      <PageHeader title="项目" description="管理本地开发项目并快速启动" actions={<Button variant="primary" onClick={onAdd}><Plus size={15} />添加项目</Button>} />
      <Toolbar>
        <SearchInput placeholder="搜索项目名称或路径" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="按标签筛选项目" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          {tagOptions.map((tag) => <option key={tag}>{tag}</option>)}
        </select>
        <select aria-label="按启动状态筛选项目" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option>全部状态</option>
          <option>可启动</option>
          <option>未配置</option>
          <option>运行中</option>
          <option>部分运行</option>
          <option>已结束</option>
          <option>失败</option>
          <option>已停止</option>
        </select>
        <select aria-label="按归档状态筛选项目" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)}>
          <option>活跃项目</option>
          <option>已归档</option>
          <option>全部项目</option>
        </select>
      </Toolbar>
      <div className="split-layout">
        <Panel className="list-panel">
          <div className="table-head projects-grid"><span>项目</span><span>标签</span><span>启动项</span><span>状态</span><span>操作</span></div>
          {loading && (
            <div className="empty-state">
              <strong>正在加载项目</strong>
              <small>正在读取 Workbench 本地数据库。</small>
            </div>
          )}
          {!loading && loadError && (
            <div className="empty-state">
              <strong>项目加载失败</strong>
              <small>{loadError}</small>
            </div>
          )}
          {!loading && !loadError && visibleProjects.map((project) => {
            const projectLaunchRun = currentLaunchRuns[project.id] ?? null;
            const launchStatus = getProjectLaunchStatus(project, projectLaunchTimes, projectLaunchRun);
            const isRunningProject = Boolean(projectLaunchRun?.sessions.some((session) => isActiveLaunchStatus(session.status)));
            return (
              <div
                key={project.id}
                className={`table-row projects-grid ${selectedProject?.id === project.id ? "selected" : ""}`}
                role="group"
                aria-label={`${project.name} 项目`}
                aria-current={selectedProject?.id === project.id ? "true" : undefined}
                tabIndex={0}
                onClick={() => onSelect(project.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(project.id);
                }}
              >
                <span className="title-cell">
                  <strong>{project.name}{project.archived && <i className="archived-inline">已归档</i>}</strong>
                  <small>{project.path}</small>
                </span>
                <TagList tags={project.tags} />
                <span className="command-cell">{formatLaunchConfigSummary(project)}</span>
                <span><StatusBadge tone={projectStatusTone(launchStatus)}>{launchStatus}</StatusBadge></span>
                <ActionGroup className="row-actions">
                  <IconButton
                    title="打开目录"
                    onClick={(event) => {
                      event.stopPropagation();
                      void workbenchApi.openLocalPath(project.path);
                    }}
                  >
                    <FolderOpen size={14} />
                  </IconButton>
                  <ProjectOpenProfileMenu
                    project={project}
                    profiles={projectOpenProfiles}
                    onOpen={onOpenWithProfile ?? (() => undefined)}
                  />
                  <IconButton
                    title={isRunningProject ? "停止项目" : "启动项目"}
                    disabled={enabledLaunchConfigs(project).length === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isRunningProject && projectLaunchRun) {
                        onStopLaunchRun(projectLaunchRun.id);
                      } else {
                        onLaunch(project);
                      }
                    }}
                  >
                    {isRunningProject ? <Pause size={14} /> : <Play size={14} />}
                  </IconButton>
                  <IconButton
                    title="编辑项目"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(project);
                    }}
                  >
                    <Edit3 size={14} />
                  </IconButton>
                  <IconButton
                    title={!project.archived && isRunningProject ? "运行中不可归档" : project.archived ? "恢复项目" : "归档项目"}
                    disabled={!project.archived && isRunningProject}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!project.archived && isRunningProject) return;
                      onArchive(project, !project.archived);
                    }}
                  >
                    {project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </IconButton>
                </ActionGroup>
              </div>
            );
          })}
          {!loading && !loadError && visibleProjects.length === 0 && (
            <div className="empty-state">
              <strong>{projects.length === 0 ? "暂无项目" : "没有匹配的项目"}</strong>
              <small>{projects.length === 0 ? "点击右上角“添加项目”记录本地项目路径和启动配置。" : "调整搜索、标签、启动状态或归档筛选后重试。"}</small>
            </div>
          )}
        </Panel>

        <Panel className="detail-panel">
          {selectedProject ? (
            <>
              <DetailHeader
                title={selectedProject.name}
                description={selectedProject.note}
                actions={
                  <>
                  <IconButton title="编辑" onClick={() => onEdit(selectedProject)}><Edit3 size={15} /></IconButton>
                  <IconButton
                    title={!selectedProject.archived && selectedProjectRunning ? "运行中不可归档" : selectedProject.archived ? "恢复项目" : "归档项目"}
                    disabled={!selectedProject.archived && selectedProjectRunning}
                    onClick={() => {
                      if (!selectedProject.archived && selectedProjectRunning) return;
                      onArchive(selectedProject, !selectedProject.archived);
                    }}
                  >
                    {selectedProject.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </IconButton>
                  </>
                }
              />
              <div className="form-grid">
                <label>项目路径<input value={selectedProject.path} readOnly /></label>
                <label>标签<input value={selectedProject.tags.join(", ")} readOnly /></label>
                <label className="full">备注<textarea rows={4} value={selectedProject.note} readOnly /></label>
              </div>
              <div className="detail-meta-grid">
                <div><small>启动状态</small><strong>{getProjectLaunchStatus(selectedProject, projectLaunchTimes, selectedLaunchRun)}</strong></div>
                <div><small>最近启动</small><strong>{projectLaunchTimes[selectedProject.id] ?? "暂无"}</strong></div>
                <div><small>项目状态</small><strong>{selectedProject.archived ? "已归档" : "活跃"}</strong></div>
                <div><small>启动方式</small><strong>内嵌启动会话</strong></div>
              </div>
              <LaunchItemsPanel
                project={selectedProject}
                launchRun={selectedLaunchRun}
                projectLaunchTime={projectLaunchTimes[selectedProject.id]}
                onLaunch={onLaunch}
                onStopLaunchSession={onStopLaunchSession}
                onStopLaunchRun={onStopLaunchRun}
                onRestartLaunchSession={onRestartLaunchSession}
                onClearLaunchRun={() => onClearLaunchRun(selectedProject.id)}
                onOpenLaunchLogs={() => setLaunchLogProjectId(selectedProject.id)}
              />
              <div className="boundary-note">
                <span className="status-dot" />
                <p>Workbench 只展示本次启动的内存日志；不保存历史日志，再次启动会创建全新的会话组。</p>
              </div>
            </>
          ) : (
            <div className="empty-state detail-empty">
              <strong>还没有项目</strong>
              <small>添加项目后，可以配置启动项并在 Workbench 内查看本次启动输出。</small>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

export function getProjectLaunchStatus(project: Project, _projectLaunchTimes: Record<string, string>, launchRun?: LaunchRun | null) {
  if (launchRun?.projectId === project.id && launchRun.sessions.length) {
    const statuses = launchRun.sessions.map((session) => session.status);
    const activeCount = statuses.filter(isActiveLaunchStatus).length;
    if (activeCount > 0) return activeCount === statuses.length ? "运行中" : "部分运行";
    if (statuses.some((status) => status === "failed")) return "失败";
    if (statuses.every((status) => status === "stopped")) return "已停止";
    if (statuses.every((status) => status === "exited")) return "已结束";
  }
  return enabledLaunchConfigs(project).length ? "可启动" : "未配置";
}

function ProjectOpenProfileMenu({
  project,
  profiles,
  onOpen
}: {
  project: Project;
  profiles: ProjectOpenProfile[];
  onOpen: (project: Project, profile: ProjectOpenProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const enabledProfiles = profiles.filter((profile) => profile.enabled);
  return (
    <span className="row-menu">
      <IconButton
        title="用工具打开"
        aria-label={`用工具打开 ${project.name}`}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MonitorUp size={14} />
      </IconButton>
      {open && (
        <span className="row-menu-popover" role="menu" aria-label={`${project.name} 打开方式`}>
          {enabledProfiles.length ? enabledProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onOpen(project, profile);
              }}
            >
              {profile.kind === "terminal" ? <Terminal size={13} /> : <MonitorUp size={13} />}
              <span>{profile.name}</span>
            </button>
          )) : (
            <span className="row-menu-empty">没有启用的打开方式</span>
          )}
        </span>
      )}
    </span>
  );
}

function projectStatusTone(status: string): "neutral" | "accent" | "success" | "danger" {
  if (status === "未配置" || status === "已停止" || status === "已结束") return "neutral";
  if (status === "失败") return "danger";
  if (status === "运行中" || status === "部分运行" || status === "启动中") return "success";
  return "accent";
}

function launchStatusTone(status: LaunchSession["status"]): "neutral" | "accent" | "success" | "danger" {
  if (status === "running" || status === "starting") return "success";
  if (status === "failed") return "danger";
  if (status === "stopped" || status === "exited") return "neutral";
  return "accent";
}

function LaunchItemsPanel({
  project,
  launchRun,
  projectLaunchTime,
  onLaunch,
  onStopLaunchSession,
  onStopLaunchRun,
  onRestartLaunchSession,
  onClearLaunchRun,
  onOpenLaunchLogs
}: {
  project: Project;
  launchRun: LaunchRun | null;
  projectLaunchTime?: string;
  onLaunch: (project: Project) => void;
  onStopLaunchSession: (sessionId: string) => void;
  onStopLaunchRun: (launchRunId: string) => void;
  onRestartLaunchSession: (session: LaunchSession) => void;
  onClearLaunchRun: () => void;
  onOpenLaunchLogs: () => void;
}) {
  const hasRunningSession = Boolean(launchRun?.sessions.some((session) => isActiveLaunchStatus(session.status)));
  const launchSessionsByConfigId = new Map((launchRun?.sessions ?? []).map((session) => [session.configId, session]));
  const launchItems = [
    ...project.launchConfigs.map((config) => ({
      key: config.id,
      name: config.name,
      command: config.command,
      workdir: config.workdir || project.path,
      config,
      session: launchSessionsByConfigId.get(config.id)
    })),
    ...(launchRun?.sessions ?? [])
      .filter((session) => !project.launchConfigs.some((config) => config.id === session.configId))
      .map((session) => ({
        key: session.id,
        name: session.configName,
        command: session.command,
        workdir: session.workdir || project.path,
        config: null,
        session
      }))
  ];
  const enabledCount = enabledLaunchConfigs(project).length;
  const headerSummary = launchRun
    ? `${projectLaunchTime ?? launchRun.startedAt} · ${launchRun.sessions.length} 个启动项`
    : `${enabledCount}/${project.launchConfigs.length} 启动项`;

  return (
    <section className="launch-items-panel" aria-label="启动项">
      <header>
        <span>
          <h3>启动项</h3>
          <small>{headerSummary}</small>
        </span>
        <span className="launch-run-actions">
          {launchRun && <Button onClick={onOpenLaunchLogs}><FileText size={14} />查看日志</Button>}
          {launchRun && hasRunningSession ? (
            <IconButton
              title="停止全部会话"
              onClick={() => onStopLaunchRun(launchRun.id)}
            >
              <Square size={14} />
            </IconButton>
          ) : launchRun ? (
            <>
              <IconButton title="重新启动全部" onClick={() => onLaunch(project)}>
                <RefreshCcw size={14} />
              </IconButton>
              <IconButton title="关闭本次记录" onClick={onClearLaunchRun}>
                <X size={14} />
              </IconButton>
            </>
          ) : (
            enabledCount > 0 && (
              <IconButton title="启动项目" onClick={() => onLaunch(project)}>
                <Play size={14} />
              </IconButton>
            )
          )}
        </span>
      </header>
      <div className="launch-item-list">
        {launchItems.length ? launchItems.map((item) => {
          const session = item.session;
          const sessionStatus = session ? formatLaunchSessionStatus(session) : formatLaunchConfigState(item.config);
          return (
            <article className="launch-item-card" key={item.key}>
              <div className="launch-item-head">
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.workdir}</small>
                </span>
                <span className="launch-session-actions">
                  <StatusBadge tone={session ? launchStatusTone(session.status) : launchConfigTone(item.config)}>{sessionStatus}</StatusBadge>
                </span>
              </div>
              <code>{item.command || "未配置命令"}</code>
              {session && (
                <div className="launch-item-footer">
                  <span className="launch-session-actions">
                    {isActiveLaunchStatus(session.status) ? (
                      <IconButton
                        title="停止会话"
                        onClick={() => onStopLaunchSession(session.id)}
                      >
                        <Square size={14} />
                      </IconButton>
                    ) : (
                      <IconButton
                        title="重新启动此项"
                        onClick={() => onRestartLaunchSession(session)}
                      >
                        <RefreshCcw size={14} />
                      </IconButton>
                    )}
                  </span>
                </div>
              )}
            </article>
          );
        }) : <p className="muted">暂无启动项。</p>}
      </div>
    </section>
  );
}

function launchConfigTone(config: ProjectLaunchConfig | null): "neutral" | "accent" {
  return config?.enabled && config.command.trim() ? "accent" : "neutral";
}

function formatLaunchConfigState(config: ProjectLaunchConfig | null) {
  if (!config) return "已结束";
  if (!config.enabled) return "停用";
  return config.command.trim() ? "可启动" : "未配置";
}

function LaunchLogDetailPage({
  project,
  launchRun,
  onBack,
  onLaunch,
  onStopLaunchSession,
  onStopLaunchRun,
  onRestartLaunchSession,
  onSyncLaunchRun,
  onOpenLogUrl,
  onClearLaunchRun
}: {
  project: Project;
  launchRun: LaunchRun;
  onBack: () => void;
  onLaunch: (project: Project) => void;
  onStopLaunchSession: (sessionId: string) => void;
  onStopLaunchRun: (launchRunId: string) => void;
  onRestartLaunchSession: (session: LaunchSession) => void;
  onSyncLaunchRun: (launchRunId: string) => void;
  onOpenLogUrl: (url: string) => void;
  onClearLaunchRun: () => void;
}) {
  const [activeSessionId, setActiveSessionId] = useState("all");
  const hasRunningSession = launchRun.sessions.some((session) => isActiveLaunchStatus(session.status));
  const activeSession = launchRun.sessions.find((session) => session.id === activeSessionId);
  const visibleLogs = activeSessionId === "all"
    ? combinedLaunchLogs(launchRun.sessions)
    : sessionLaunchLogs(activeSession);

  useEffect(() => {
    onSyncLaunchRun(launchRun.id);
    const timer = window.setInterval(() => onSyncLaunchRun(launchRun.id), 1000);
    return () => window.clearInterval(timer);
  }, [launchRun.id]);

  return (
    <section className="view launch-log-view">
      <div className="launch-log-page-header">
        <div>
          <div className="breadcrumb">项目 / {project.name} / 本次启动日志</div>
          <h1>{project.name} 启动日志</h1>
          <p>{project.path}</p>
        </div>
        <div className="launch-log-actions">
          <Button onClick={onBack}><ArrowLeft size={15} />返回项目列表</Button>
          {hasRunningSession ? (
            <IconButton title="停止全部会话" onClick={() => onStopLaunchRun(launchRun.id)}>
              <Square size={15} />
            </IconButton>
          ) : (
            <>
              <IconButton title="重新启动全部" onClick={() => onLaunch(project)}>
                <RefreshCcw size={15} />
              </IconButton>
              <IconButton title="关闭本次记录" onClick={onClearLaunchRun}>
                <X size={15} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      <div className="launch-log-meta">
        <span><StatusBadge tone={hasRunningSession ? "success" : "neutral"}>{getProjectLaunchStatus(project, {}, launchRun)}</StatusBadge></span>
        <span>{launchRun.startedAt}</span>
        <span>{launchRun.sessions.length} 个启动项</span>
      </div>

      <section className="launch-log-surface" aria-label="启动日志详情">
        <div className="launch-log-tabs">
          <div className="launch-log-tab-list" role="tablist" aria-label="启动项日志">
            <button
              type="button"
              role="tab"
              aria-selected={activeSessionId === "all"}
              className={activeSessionId === "all" ? "active" : ""}
              onClick={() => setActiveSessionId("all")}
            >
              全部
            </button>
            {launchRun.sessions.map((session) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeSessionId === session.id}
                className={activeSessionId === session.id ? "active" : ""}
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
              >
                {session.configName}
              </button>
            ))}
          </div>
          <div className="launch-log-tab-actions">
            {activeSession ? (
              <>
              <StatusBadge tone={launchStatusTone(activeSession.status)}>{formatLaunchSessionStatus(activeSession)}</StatusBadge>
              {isActiveLaunchStatus(activeSession.status) ? (
                <IconButton title="停止会话" onClick={() => onStopLaunchSession(activeSession.id)}>
                  <Square size={14} />
                </IconButton>
              ) : (
                <IconButton title="重新启动此项" onClick={() => onRestartLaunchSession(activeSession)}>
                  <RefreshCcw size={14} />
                </IconButton>
              )}
              </>
            ) : (
              <StatusBadge tone={hasRunningSession ? "success" : "neutral"}>{getProjectLaunchStatus(project, {}, launchRun)}</StatusBadge>
            )}
          </div>
        </div>

        <div className="launch-log-output" role="log" aria-label="启动日志输出">
          {visibleLogs.length
            ? visibleLogs.map((line, index) => (
              <span className={`log-line ${line.stream}`} key={`${line.sessionId}-${index}`}>
                {renderLogLine(line.content, onOpenLogUrl)}
              </span>
            ))
            : <span className="muted-output">等待输出...</span>}
        </div>
      </section>
    </section>
  );
}

function renderLogLine(content: string, onOpenLogUrl: (url: string) => void) {
  const segments = splitLogLineByUrl(content);
  return segments.map((segment, index) => {
    if (segment.kind === "url") {
      return (
        <button
          className="log-link"
          key={`${segment.text}-${index}`}
          type="button"
          aria-label={`打开链接 ${segment.text}`}
          onClick={() => onOpenLogUrl(segment.text)}
        >
          {segment.text}
        </button>
      );
    }
    return <span key={`${segment.text}-${index}`}>{segment.text}</span>;
  });
}

function splitLogLineByUrl(content: string) {
  const urlPattern = /https?:\/\/[^\s)]+[^\s).,;:!?]/g;
  const segments: Array<{ kind: "text" | "url"; text: string }> = [];
  let cursor = 0;
  for (const match of content.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "text", text: content.slice(cursor, index) });
    }
    segments.push({ kind: "url", text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) {
    segments.push({ kind: "text", text: content.slice(cursor) });
  }
  return segments;
}

function combinedLaunchLogs(sessions: LaunchSession[]) {
  return sessions.flatMap((session) =>
    sessionLaunchLogs(session).map((line) => ({
      ...line,
      content: `[${session.configName}] ${line.content}`
    }))
  );
}

function sessionLaunchLogs(session: LaunchSession | undefined) {
  if (!session) return [];
  return session.output.flatMap((chunk) =>
    chunk.content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => ({
        sessionId: session.id,
        stream: chunk.stream,
        content: line
      }))
  );
}

function formatLaunchSessionStatus(session: LaunchSession) {
  if (session.status === "exited") return `已退出 ${session.exitCode ?? 0}`;
  if (session.status === "failed") return `失败 ${session.exitCode ?? ""}`.trim();
  if (session.status === "stopped") return "已停止";
  if (session.status === "running") return "运行中";
  return "启动中";
}

function isActiveLaunchStatus(status: LaunchSession["status"]) {
  return status === "starting" || status === "running";
}

function isProjectRunning(projectId: string, launchRuns: Record<string, LaunchRun>) {
  return Boolean(launchRuns[projectId]?.sessions.some((session) => isActiveLaunchStatus(session.status)));
}

function normalizeLaunchSessionEvent(event: LaunchSessionEvent): LaunchSessionEvent {
  const rawEvent = event as LaunchSessionEvent & {
    event_type?: LaunchSessionEvent["eventType"];
    launch_run_id?: string;
    session_id?: string;
    exit_code?: number;
  };
  const eventType = String(rawEvent.eventType ?? rawEvent.event_type).toLowerCase();
  const stream = rawEvent.stream ? String(rawEvent.stream).toLowerCase() : undefined;
  const status = rawEvent.status ? String(rawEvent.status).toLowerCase() : undefined;

  return {
    launchRunId: rawEvent.launchRunId ?? rawEvent.launch_run_id ?? "",
    sessionId: rawEvent.sessionId ?? rawEvent.session_id ?? "",
    eventType: eventType === "status" ? "status" : "output",
    stream: stream === "stderr" ? "stderr" : stream === "stdout" ? "stdout" : undefined,
    content: rawEvent.content,
    status: isLaunchSessionStatus(status) ? status : undefined,
    exitCode: rawEvent.exitCode ?? rawEvent.exit_code
  };
}

function isLaunchSessionStatus(status: string | undefined): status is LaunchSession["status"] {
  return status === "starting" || status === "running" || status === "exited" || status === "failed" || status === "stopped";
}

function applyLaunchSessionEvent(current: LaunchRun | null, event: LaunchSessionEvent) {
  if (!current || current.id !== event.launchRunId) return current;
  return {
    ...current,
    sessions: current.sessions.map((session) => {
      if (session.id !== event.sessionId) return session;
      if (event.eventType === "output" && event.stream && typeof event.content === "string") {
        return {
          ...session,
          output: [...session.output, { stream: event.stream, content: event.content }]
        };
      }
      if (event.eventType === "status" && event.status) {
        return {
          ...session,
          status: event.status,
          exitCode: event.exitCode ?? session.exitCode
        };
      }
      return session;
    })
  };
}

export function applyPendingLaunchEvents(launchRun: LaunchRun, pendingEvents: Record<string, LaunchSessionEvent[]>) {
  const events = pendingEvents[launchRun.id] ?? [];
  delete pendingEvents[launchRun.id];
  return events.reduce((current, event) => applyLaunchSessionEvent(current, normalizeLaunchSessionEvent(event)) ?? current, launchRun);
}

export function markLaunchRunStopped(launchRun: LaunchRun, sessionId?: string) {
  return {
    ...launchRun,
    sessions: launchRun.sessions.map((session) => {
      if (sessionId && session.id !== sessionId) return session;
      if (!isActiveLaunchStatus(session.status)) return session;
      return { ...session, status: "stopped" as const };
    })
  };
}

function replaceLaunchSession(launchRun: LaunchRun, nextSession: LaunchSession) {
  return {
    ...launchRun,
    sessions: launchRun.sessions.map((session) => session.id === nextSession.id ? nextSession : session)
  };
}

function markLaunchSessionStoppedInRuns(launchRuns: Record<string, LaunchRun>, sessionId: string) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) =>
    launchRun.sessions.some((session) => session.id === sessionId)
  );
  if (!entry) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: markLaunchRunStopped(launchRun, sessionId)
  };
}

function markLaunchRunStoppedInRuns(launchRuns: Record<string, LaunchRun>, launchRunId: string) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) => launchRun.id === launchRunId);
  if (!entry) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: markLaunchRunStopped(launchRun)
  };
}

function replaceLaunchSessionInRuns(launchRuns: Record<string, LaunchRun>, nextSession: LaunchSession) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) =>
    launchRun.sessions.some((session) => session.id === nextSession.id)
  );
  if (!entry) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: replaceLaunchSession(launchRun, nextSession)
  };
}

function mergeLaunchRunSnapshotsInRuns(launchRuns: Record<string, LaunchRun>, launchRunId: string, snapshots: LaunchSessionSnapshot[]) {
  const entry = Object.entries(launchRuns).find(([, launchRun]) => launchRun.id === launchRunId);
  if (!entry || snapshots.length === 0) return launchRuns;
  const [projectId, launchRun] = entry;
  return {
    ...launchRuns,
    [projectId]: mergeLaunchRunSnapshots(launchRun, snapshots)
  };
}

export function mergeLaunchRunSnapshots(launchRun: LaunchRun, snapshots: LaunchSessionSnapshot[]) {
  const snapshotsBySessionId = new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot]));
  return {
    ...launchRun,
    sessions: launchRun.sessions.map((session) => {
      const snapshot = snapshotsBySessionId.get(session.id);
      if (!snapshot) return session;
      return {
        ...session,
        status: snapshot.status,
        exitCode: snapshot.exitCode,
        output: snapshot.output
      };
    })
  };
}

function isAlreadyEndedLaunchMessage(message: string) {
  return message.includes("启动会话不存在或已结束") || message.includes("没有可停止的启动会话");
}

export function enabledLaunchConfigs(project: Project) {
  return project.launchConfigs.filter((config) => config.enabled && config.command.trim());
}

function formatLaunchConfigSummary(project: Project) {
  const total = project.launchConfigs.length;
  const enabled = enabledLaunchConfigs(project).length;
  if (total === 0) return <small>未配置</small>;
  return <span>{enabled}/{total} 启动项</span>;
}

function formatLaunchTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function SkillsView({
  skills,
  selectedSkill,
  categories: skillCategories,
  settings,
  projects,
  onSelect,
  onImport,
  onRefresh,
  marketInstallTask,
  onInstallMarketSkill,
  onManageCategories,
  onToggle,
  onToggleSkillGlobal,
  onToggleProjectAll,
  onCategorySkill,
  onCreateCategorySkill,
  onResolve,
  onDeleteSkill
}: {
  skills: Skill[];
  selectedSkill: Skill;
  categories: SkillCategory[];
  settings: AppSettings;
  projects: Project[];
  onSelect: (id: string) => void;
  onImport: (kind: "zip" | "folder") => Promise<void>;
  onRefresh: () => void | Promise<void>;
  marketInstallTask?: MarketInstallTask | null;
  onInstallMarketSkill?: (item: SkillMarketItem) => void;
  onManageCategories: () => void;
  onToggle: (tool: ToolKey, enabled: boolean, project?: Project) => void;
  onToggleSkillGlobal: (directoryName: string, tool: ToolKey, enabled: boolean) => void;
  onToggleProjectAll: (project: Project, enabled: boolean) => void;
  onCategorySkill: (directoryName: string, categoryId: string) => void;
  onCreateCategorySkill: (directoryName: string, name: string) => void;
  onResolve: (source: SkillVersionSource) => void;
  onDeleteSkill: (skillId: string) => void;
}) {
  const [activeSkillsTab, setActiveSkillsTab] = useState<"local" | "market" | "updates">("local");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部分类");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [toolFilter, setToolFilter] = useState<ToolKey | "全部工具">("全部工具");
  const [projectFilter, setProjectFilter] = useState("全部项目");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState("");
  const [marketStatusFilter, setMarketStatusFilter] = useState<"全部状态" | "未安装" | "已安装" | "可更新" | "不可安装">("全部状态");
  const [marketItems, setMarketItems] = useState<SkillMarketItem[]>([]);
  const [selectedMarketKey, setSelectedMarketKey] = useState("");
  const [marketDetail, setMarketDetail] = useState<SkillMarketDetail | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [uninstallingMarketKey, setUninstallingMarketKey] = useState("");
  const [deletingMarketItem, setDeletingMarketItem] = useState<SkillMarketItem | null>(null);
  const [updateStatuses, setUpdateStatuses] = useState<SkillUpdateStatus[]>([]);
  const [selectedUpdateNames, setSelectedUpdateNames] = useState<string[]>([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingNames, setUpdatingNames] = useState<string[]>([]);
  const [updateResults, setUpdateResults] = useState<SkillUpdateResult[]>([]);
  const handledMarketInstallRef = useRef("");
  const handleMarketInstall = onInstallMarketSkill ?? ((item: SkillMarketItem) => {
    void workbenchApi.installSkillFromMarket(item.source, item.skillId, () => undefined)
      .then(() => onRefresh())
      .catch((error) => setMarketError(String(error)));
  });
  const categories = ["全部分类", ...skillCategories.map((category) => category.name)];
  const projectToolTargets = settings.toolTargets.filter((tool) => tool.supportsProjectScope);
  const visibleSkills = skills.filter((skill) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery);
    const matchesCategory = categoryFilter === "全部分类" || skill.category === categoryFilter;
    const matchesStatus = skillMatchesStatusFilter(skill, statusFilter);
    const matchesToolProject = skillMatchesToolProjectFilter(skill, toolFilter, projectFilter);
    return matchesQuery && matchesCategory && matchesStatus && matchesToolProject;
  });
  const visibleMarketItems = marketItems.filter((item) => {
    const normalizedQuery = marketQuery.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.skillId.toLowerCase().includes(normalizedQuery) ||
      item.source.toLowerCase().includes(normalizedQuery);
    const matchesStatus =
      marketStatusFilter === "全部状态" ||
      (marketStatusFilter === "未安装" && !item.installedDirectoryName && item.installable) ||
      (marketStatusFilter === "已安装" && Boolean(item.installedDirectoryName)) ||
      (marketStatusFilter === "可更新" && item.updateStatus === "update_available") ||
      (marketStatusFilter === "不可安装" && !item.installable);
    return matchesQuery && matchesStatus;
  });
  const selectedMarketItem = visibleMarketItems.find((item) => `${item.source}/${item.skillId}` === selectedMarketKey) ?? visibleMarketItems[0];
  const marketStats = buildMarketStats(marketItems);
  const updateableStatuses = updateStatuses.filter((status) => status.status === "update_available");
  const selectedUpdateableNames = selectedUpdateNames.filter((directoryName) =>
    updateableStatuses.some((status) => status.source.directoryName === directoryName)
  );

  useEffect(() => {
    if (activeSkillsTab !== "market" || marketItems.length > 0 || marketLoading) return;
    void loadMarketItems();
  }, [activeSkillsTab]);

  useEffect(() => {
    if (activeSkillsTab !== "updates" || updateStatuses.length > 0 || checkingUpdates) return;
    void loadSkillUpdates(false);
  }, [activeSkillsTab]);

  useEffect(() => {
    if (activeSkillsTab !== "market" || !marketInstallTask || marketInstallTask.status === "running") return;
    const marker = `${marketInstallTask.key}:${marketInstallTask.status}`;
    if (handledMarketInstallRef.current === marker) return;
    handledMarketInstallRef.current = marker;
    if (marketInstallTask.status === "succeeded") {
      void loadMarketItems("", true);
      void loadSkillUpdates(false);
      return;
    }
    setMarketError(marketInstallTask.error || "Skill 安装失败");
  }, [activeSkillsTab, marketInstallTask?.key, marketInstallTask?.status, marketInstallTask?.error]);

  useEffect(() => {
    if (!selectedMarketItem) {
      setMarketDetail(null);
      return;
    }
    const key = `${selectedMarketItem.source}/${selectedMarketItem.skillId}`;
    if (marketDetail && `${marketDetail.item.source}/${marketDetail.item.skillId}` === key) return;
    void loadMarketDetail(selectedMarketItem);
  }, [selectedMarketItem?.source, selectedMarketItem?.skillId]);

  async function loadMarketItems(query = marketQuery, force = false) {
    if (skillMarketRuntimeCache && !force) {
      setMarketItems(skillMarketRuntimeCache.items);
      setSelectedMarketKey((current) => current || (skillMarketRuntimeCache?.items[0] ? `${skillMarketRuntimeCache.items[0].source}/${skillMarketRuntimeCache.items[0].skillId}` : ""));
      return;
    }
    setMarketLoading(true);
    setMarketError("");
    try {
      const items = await workbenchApi.listSkillMarket(query);
      setMarketItems(items);
      if (!query.trim()) {
        skillMarketRuntimeCache = { items, updatedAt: Date.now() };
      }
      setSelectedMarketKey((current) => current || (items[0] ? `${items[0].source}/${items[0].skillId}` : ""));
    } catch (error) {
      setMarketError(String(error));
    } finally {
      setMarketLoading(false);
    }
  }

  async function loadMarketDetail(item: SkillMarketItem) {
    setMarketError("");
    if (!item.installable) {
      setMarketDetail(localMarketDetail(item));
      return;
    }
    try {
      setMarketDetail(await workbenchApi.getSkillMarketDetail(item.source, item.skillId));
    } catch (error) {
      setMarketDetail(null);
      setMarketError(String(error));
    }
  }

  async function uninstallMarketSkill(item: SkillMarketItem) {
    const directoryName = item.installedDirectoryName || item.skillId;
    const key = `${item.source}/${item.skillId}`;
    setUninstallingMarketKey(key);
    setMarketError("");
    try {
      await workbenchApi.deleteSkill(directoryName);
      skillMarketRuntimeCache = null;
      setSelectedUpdateNames((current) => current.filter((name) => name !== directoryName));
      await loadMarketItems("", true);
      await loadSkillUpdates(false);
      await onRefresh();
    } catch (error) {
      setMarketError(String(error));
    } finally {
      setUninstallingMarketKey("");
    }
  }

  async function loadSkillUpdates(checkRemote: boolean) {
    setCheckingUpdates(true);
    try {
      const statuses = checkRemote ? await workbenchApi.checkSkillUpdates() : await workbenchApi.listSkillUpdates();
      setUpdateStatuses(statuses);
      setSelectedUpdateNames((current) =>
        current.filter((directoryName) => statuses.some((status) => status.source.directoryName === directoryName))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateResults([{ directoryName: checkRemote ? "更新检查" : "更新列表", status: "check_failed", message }]);
      if (activeSkillsTab === "market") {
        setMarketError(`更新状态刷新失败：${message}`);
      }
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function updateSelectedSkills(directoryNames: string[]) {
    const targets = directoryNames.filter((directoryName) =>
      updateStatuses.some((status) => status.source.directoryName === directoryName && status.status === "update_available")
    );
    if (targets.length === 0) return;
    setUpdatingNames(targets);
    try {
      const results = await workbenchApi.updateMarketSkills(targets);
      setUpdateResults(results);
      await loadSkillUpdates(false);
      await onRefresh();
      setSelectedUpdateNames([]);
    } finally {
      setUpdatingNames([]);
    }
  }

  return (
    <section className="view">
      <header className="skills-header">
        <div className="skills-title">
          <h1>Skills</h1>
          <p>统一根目录 · {skills.length} 个 Skills</p>
        </div>
        <div className="skills-subnav" role="tablist" aria-label="Skills 子视图">
          <button className={activeSkillsTab === "local" ? "active" : ""} onClick={() => setActiveSkillsTab("local")}>本地 Skills</button>
          <button className={activeSkillsTab === "market" ? "active" : ""} onClick={() => setActiveSkillsTab("market")}>技能市场</button>
          <button className={activeSkillsTab === "updates" ? "active" : ""} onClick={() => setActiveSkillsTab("updates")}>
            更新{updateableStatuses.length > 0 ? ` ${updateableStatuses.length}` : ""}
          </button>
        </div>
        <div className="skills-header-actions">
          <div className="header-actions">
            <Button onClick={onRefresh}><RefreshCcw size={15} />扫描</Button>
            <Button onClick={onManageCategories}><Settings size={15} />管理分类</Button>
            <div className="import-control">
              <Button variant="primary" onClick={() => setImportMenuOpen(!importMenuOpen)}>
                <Download size={15} />导入 Skills<ChevronDown size={14} />
              </Button>
              {importMenuOpen && (
                <div className="import-menu">
                  <button onClick={() => { setImportMenuOpen(false); void onImport("zip"); }}>选择 ZIP 文件</button>
                  <button onClick={() => { setImportMenuOpen(false); void onImport("folder"); }}>选择已解压文件夹</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {activeSkillsTab === "local" && (
        <>
          <div className="root-bar">
            <span><strong>统一根目录</strong>{settings.skillsRoot}</span>
            <Button onClick={() => void workbenchApi.openLocalPath(settings.skillsRoot)}><FolderOpen size={15} />打开目录</Button>
          </div>
          <Toolbar>
            <SearchInput placeholder="搜索名称或描述" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="按分类筛选 Skills" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select aria-label="按状态筛选 Skills" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>全部状态</option>
              <option>已启用</option>
              <option>内容冲突</option>
              <option>未启用</option>
            </select>
            <select aria-label="按启用项目筛选 Skills" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
              <option value="全部项目">全部项目</option>
              {projects.map((project) => <option key={project.path} value={project.path}>{project.name}</option>)}
            </select>
            <select aria-label="按启用工具筛选 Skills" value={toolFilter} onChange={(event) => setToolFilter(event.target.value as ToolKey | "全部工具")}>
              <option value="全部工具">全部工具</option>
              {settings.toolTargets.map((tool) => <option key={tool.key} value={tool.key}>{tool.name}</option>)}
            </select>
          </Toolbar>
          <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head skills-grid"><span>Skill</span><span>分类</span><span>全局启用</span><span>项目启用</span><span className="table-action-heading">操作</span></div>
          {visibleSkills.map((skill) => (
            <div
              key={skill.id}
              className={`table-row skills-grid ${selectedSkill.id === skill.id ? "selected" : ""}`}
              role="group"
              aria-label={`${skill.name} Skill`}
              aria-current={selectedSkill.id === skill.id ? "true" : undefined}
              tabIndex={0}
              onClick={() => onSelect(skill.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(skill.id);
              }}
            >
              <span className="title-cell"><strong>{skill.name}</strong><small>{skill.description}</small></span>
              <SkillCategorySelect
                skillName={skill.name}
                categoryId={skill.categoryId}
                categories={skillCategories}
                onSave={(categoryId) => onCategorySkill(skill.directoryName, categoryId)}
                onCreate={(name) => onCreateCategorySkill(skill.directoryName, name)}
              />
              <GlobalToolIcons
                skill={skill}
                tools={settings.toolTargets}
                onToggle={(tool, enabled) => onToggleSkillGlobal(skill.directoryName, tool, enabled)}
              />
              <span>{skill.enabledProjects.length ? `${skill.enabledProjects.length} 个项目` : "未启用"}</span>
              <ActionGroup align="start" className="row-actions table-actions">
                <IconButton
                  title="打开 SKILL.md"
                  onClick={(event) => {
                    event.stopPropagation();
                    void workbenchApi.openLocalPath(skill.skillPath);
                  }}
                >
                  <FileText size={14} />
                </IconButton>
                <IconButton
                  variant="danger"
                  title="删除 Skill"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteSkill(skill.id);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </ActionGroup>
            </div>
          ))}
        </Panel>

        <Panel className="detail-panel">
          <DetailHeader title={selectedSkill.name} />
          <p className="description">{selectedSkill.description}</p>
          {selectedSkill.globalToolStates.some((state) => state.status === "conflict") && (
            <SkillConflictPanel skill={selectedSkill} settings={settings} onResolve={onResolve} />
          )}
          <div className="setting-group">
            <h3>项目启用</h3>
            {projects.map((project) => (
              <div className="project-skill-row" key={project.id}>
                <div className="project-skill-head">
                  <span><strong>{project.name}</strong><small>{project.path}</small></span>
                  <SwitchControl
                    checked={projectToolTargets.length > 0 && projectToolTargets.every((tool) =>
                      selectedSkill.enabledProjects.some(
                        (entry) => entry.projectPath === project.path && entry.tool === tool.key
                      )
                    )}
                    onChange={(enabled) => onToggleProjectAll(project, enabled)}
                    title={`${project.name} 全部工具启用`}
                  />
                </div>
                <div className="project-tool-toggles">
                  {projectToolTargets.map((tool) => {
                    const enablement = selectedSkill.enabledProjects.find(
                      (entry) => entry.projectPath === project.path && entry.tool === tool.key
                    );
                    const enabled = Boolean(enablement);
                    return (
                      <label key={tool.key} title={`${project.name} · ${tool.name}`}>
                        <small>{tool.name}{enablement ? ` · ${syncMethodLabel(enablement.syncMethod)}` : ""}</small>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) => onToggle(tool.key, event.target.checked, project)}
                        />
                        <span className="switch" />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="file-block"><span>SKILL.md</span><code>{selectedSkill.skillPath}</code></div>
        </Panel>
      </div>
        </>
      )}
      {activeSkillsTab === "market" && (
        <SkillsMarketView
          items={visibleMarketItems}
          selectedItem={selectedMarketItem}
          detail={marketDetail}
          query={marketQuery}
          statusFilter={marketStatusFilter}
          stats={marketStats}
          currentCount={visibleMarketItems.length}
          loading={marketLoading}
          error={marketError}
          installTask={marketInstallTask ?? null}
          uninstallingKey={uninstallingMarketKey}
          onQueryChange={setMarketQuery}
          onStatusFilterChange={setMarketStatusFilter}
          onRefresh={() => void loadMarketItems("", true)}
          onSearch={() => void loadMarketItems(marketQuery)}
          onSelect={(item) => setSelectedMarketKey(`${item.source}/${item.skillId}`)}
          onInstall={handleMarketInstall}
          onUninstall={setDeletingMarketItem}
          onOpenSource={(url) => void workbenchApi.openRadarLink(url)}
        />
      )}
      {activeSkillsTab === "updates" && (
        <SkillUpdatesView
          statuses={updateStatuses}
          selectedNames={selectedUpdateNames}
          checking={checkingUpdates}
          updatingNames={updatingNames}
          results={updateResults}
          onCheck={() => void loadSkillUpdates(true)}
          onSelectNames={setSelectedUpdateNames}
          onUpdateSelected={() => void updateSelectedSkills(selectedUpdateableNames)}
          onUpdateAll={() => void updateSelectedSkills(updateableStatuses.map((status) => status.source.directoryName))}
          onUpdateOne={(directoryName) => void updateSelectedSkills([directoryName])}
          onOpenMarket={() => setActiveSkillsTab("market")}
        />
      )}
      {deletingMarketItem && (
        <DeleteMarketSkillDialog
          item={deletingMarketItem}
          onClose={() => setDeletingMarketItem(null)}
          onConfirm={() => {
            const target = deletingMarketItem;
            setDeletingMarketItem(null);
            void uninstallMarketSkill(target);
          }}
        />
      )}
    </section>
  );
}

function SkillStatusIndicator({ status, label }: { status: SkillUpdateState; label?: string }) {
  const presentation = {
    not_installed: { icon: CircleDashed, tone: "neutral", label: "未安装" },
    installed: { icon: CircleCheck, tone: "success", label: "已安装" },
    up_to_date: { icon: CircleCheck, tone: "success", label: "已是最新" },
    update_available: { icon: ArrowUpCircle, tone: "attention", label: "可更新" },
    check_failed: { icon: CircleAlert, tone: "danger", label: "检查失败" },
    unsupported: { icon: Ban, tone: "neutral", label: "不支持" }
  }[status];
  const Icon = presentation.icon;
  const text = label ?? presentation.label;
  return (
    <span className={`skill-status-indicator ${presentation.tone}`} aria-label={text}>
      <Icon size={14} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

function MarketListSkeleton() {
  return (
    <div className="market-skeleton-list" aria-label="正在加载 skills.sh 市场" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="table-row market-grid market-skeleton-row" key={index} aria-hidden="true">
          <span className="skeleton-stack"><i className="skeleton skeleton-title" /><i className="skeleton skeleton-subtitle" /></span>
          <i className="skeleton skeleton-source" />
          <i className="skeleton skeleton-status" />
          <i className="skeleton skeleton-download" />
          <i className="skeleton skeleton-action" />
        </div>
      ))}
    </div>
  );
}

function MarketDetailSkeleton() {
  return (
    <div className="market-detail-skeleton" aria-label="正在加载 Skill 详情" aria-busy="true">
      <i className="skeleton skeleton-kicker" />
      <i className="skeleton skeleton-detail-title" />
      <div className="skeleton-divider" />
      <i className="skeleton skeleton-detail-line wide" />
      <i className="skeleton skeleton-detail-line" />
      <div className="skeleton-detail-grid">
        {Array.from({ length: 5 }, (_, index) => <i className="skeleton skeleton-detail-meta" key={index} />)}
      </div>
      <i className="skeleton skeleton-warning" />
      <i className="skeleton skeleton-preview" />
    </div>
  );
}

function SkillsMarketView({
  items,
  selectedItem,
  detail,
  query,
  statusFilter,
  stats,
  currentCount,
  loading,
  error,
  installTask,
  uninstallingKey,
  onQueryChange,
  onStatusFilterChange,
  onRefresh,
  onSearch,
  onSelect,
  onInstall,
  onUninstall,
  onOpenSource
}: {
  items: SkillMarketItem[];
  selectedItem: SkillMarketItem | undefined;
  detail: SkillMarketDetail | null;
  query: string;
  statusFilter: "全部状态" | "未安装" | "已安装" | "可更新" | "不可安装";
  stats: ReturnType<typeof buildMarketStats>;
  currentCount: number;
  loading: boolean;
  error: string;
  installTask: MarketInstallTask | null;
  uninstallingKey: string;
  onQueryChange: (query: string) => void;
  onStatusFilterChange: (status: "全部状态" | "未安装" | "已安装" | "可更新" | "不可安装") => void;
  onRefresh: () => void;
  onSearch: () => void;
  onSelect: (item: SkillMarketItem) => void;
  onInstall: (item: SkillMarketItem) => void;
  onUninstall: (item: SkillMarketItem) => void;
  onOpenSource: (url: string) => void;
}) {
  const selectedKey = selectedItem ? `${selectedItem.source}/${selectedItem.skillId}` : "";
  const repositoryUrl = selectedItem ? detail?.repositoryUrl || marketRepositoryUrl(selectedItem) : "";
  return (
    <>
      <Toolbar>
        <SearchInput
          placeholder="搜索 skills.sh"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
        />
        <select aria-label="按市场状态筛选" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as typeof statusFilter)}>
          <option>全部状态</option>
          <option>未安装</option>
          <option>已安装</option>
          <option>可更新</option>
          <option>不可安装</option>
        </select>
        <Button onClick={onRefresh}><RefreshCcw size={15} />刷新市场</Button>
      </Toolbar>
      {error && (
        <div className="warning market-error" role="alert">
          <span>{error}</span>
          <Button onClick={onRefresh}><RefreshCcw size={14} />重试</Button>
        </div>
      )}
      <div className="market-stats" aria-label="技能市场统计">
        {[
          [stats.total, "全部"],
          [stats.installed, "已安装"],
          [stats.notInstalled, "未安装"],
          [stats.updateAvailable, "可更新"],
          [stats.unsupported, "不支持"],
          [currentCount, "当前结果"]
        ].map(([value, label]) => (
          <span key={label}>
            <strong>{loading && items.length === 0 ? <i className="skeleton skeleton-stat" /> : value}</strong>
            <small>{label}</small>
          </span>
        ))}
      </div>
      <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head market-grid"><span>远程 Skill</span><span>来源</span><span>状态</span><span>下载</span><span className="table-action-heading">操作</span></div>
          {loading && items.length === 0 && <MarketListSkeleton />}
          {!loading && items.map((item) => {
            const key = `${item.source}/${item.skillId}`;
            const taskForItem = installTask?.key === key ? installTask : null;
            const installing = taskForItem?.status === "running";
            const installedByTask = taskForItem?.status === "succeeded" && !item.installedDirectoryName;
            const uninstalling = uninstallingKey === key;
            return (
              <div
                className={`table-row market-grid ${selectedKey === key ? "selected" : ""}`}
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(item);
                }}
              >
                <span className="title-cell"><strong>{item.name}</strong><small>{item.description || item.skillId}</small></span>
                <span className="path">{item.source}</span>
                <SkillStatusIndicator status={marketItemStatus(item)} />
                <span>{formatInstallCount(item.installs)}</span>
                <span className="row-actions table-actions install-action">
                  {installing ? (
                    <Button disabled><RefreshCcw className="spin" size={14} />安装中 {taskForItem?.progress ?? 8}%</Button>
                  ) : installedByTask ? (
                    <Button disabled><CircleCheck size={14} />安装完成</Button>
                  ) : item.installedDirectoryName ? (
                    <Button
                      variant="danger"
                      disabled={installTask?.status === "running" || uninstalling}
                      onClick={(event) => {
                        event.stopPropagation();
                        onUninstall(item);
                      }}
                    >
                      <Trash2 size={14} />{uninstalling ? "卸载中" : "卸载"}
                    </Button>
                  ) : !item.installable ? (
                    <span className="action-muted" aria-label="不可安装">不可安装</span>
                  ) : (
                    <Button
                      disabled={installTask?.status === "running"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onInstall(item);
                      }}
                    >
                      <PackagePlus size={14} />安装
                    </Button>
                  )}
                  {installing && <i style={{ width: `${taskForItem?.progress ?? 8}%` }} />}
                </span>
              </div>
            );
          })}
        </Panel>
        <Panel className="detail-panel market-detail-panel">
          {loading && items.length === 0 ? (
            <MarketDetailSkeleton />
          ) : selectedItem ? (
            <>
              <div className="market-detail-hero">
                <div>
                  <span className="market-detail-kicker">skills.sh</span>
                  <DetailHeader title={selectedItem.name} actions={repositoryUrl ? <IconButton title="打开来源仓库" onClick={() => onOpenSource(repositoryUrl)}><ExternalLink size={14} /></IconButton> : undefined} />
                </div>
              </div>
              <p className="market-detail-description">{detail?.item.description || selectedItem.description || "暂无远程描述。"}</p>
              <dl className="market-detail-list">
                <div><dt>安装状态</dt><dd><SkillStatusIndicator status={marketItemStatus(selectedItem)} /></dd></div>
                <div><dt>skills.sh 包</dt><dd><code>{selectedItem.source}/{selectedItem.skillId}</code></dd></div>
                <div><dt>Skill ID</dt><dd><code>{selectedItem.skillId}</code></dd></div>
                <div><dt>来源仓库</dt><dd><code>{repositoryUrl || "非 GitHub owner/repo 来源，暂不支持 Workbench 安装"}</code></dd></div>
                <div><dt>参考命令</dt><dd><code>{detail?.installCommand || `npx -y skills add ${selectedItem.source} --skill ${selectedItem.skillId} -g --agent codex -y --copy`}</code></dd></div>
              </dl>
              <div className="warning market-detail-warning">{detail?.securityNote || "Workbench 调用 skills.sh 官方安装器完成获取和展开，再复制到统一 Skills 根目录；第三方 Skill 仍需自行确认来源可信。"}</div>
              {detail?.skillMarkdownPreview && <div className="market-preview"><h3>SKILL.md 预览</h3><p>{detail.skillMarkdownPreview}</p></div>}
            </>
          ) : (
            <div className="notice compact-empty">暂无市场条目。</div>
          )}
        </Panel>
      </div>
    </>
  );
}

function SkillUpdatesView({
  statuses,
  selectedNames,
  checking,
  updatingNames,
  results,
  onCheck,
  onSelectNames,
  onUpdateSelected,
  onUpdateAll,
  onUpdateOne,
  onOpenMarket
}: {
  statuses: SkillUpdateStatus[];
  selectedNames: string[];
  checking: boolean;
  updatingNames: string[];
  results: SkillUpdateResult[];
  onCheck: () => void;
  onSelectNames: (names: string[]) => void;
  onUpdateSelected: () => void;
  onUpdateAll: () => void;
  onUpdateOne: (directoryName: string) => void;
  onOpenMarket: () => void;
}) {
  const updateable = statuses.filter((status) => status.status === "update_available");
  const selectedUpdateable = selectedNames.filter((directoryName) =>
    updateable.some((status) => status.source.directoryName === directoryName)
  );
  const allUpdateableSelected = updateable.length > 0 && updateable.every((status) => selectedNames.includes(status.source.directoryName));
  function toggleUpdateSelection(directoryName: string, checked: boolean) {
    onSelectNames(
      checked
        ? Array.from(new Set([...selectedNames, directoryName]))
        : selectedNames.filter((name) => name !== directoryName)
    );
  }
  return (
    <>
      <div className="bulk-bar">
        <span><strong>更新检查</strong><small>仅管理从 skills.sh 安装的 Skill。更新前会备份统一根目录中的旧版本。</small></span>
        <div className="bulk-actions">
          <Button onClick={onCheck}><RefreshCcw size={15} />{checking ? "检查中" : "检查全部"}</Button>
          <Button variant="primary" disabled={selectedUpdateable.length === 0 || updatingNames.length > 0} onClick={onUpdateSelected}>更新选中项</Button>
          <Button disabled={updateable.length === 0 || updatingNames.length > 0} onClick={onUpdateAll}>更新全部可更新项</Button>
        </div>
      </div>
      <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head update-grid">
            <span><input type="checkbox" aria-label="选择全部可更新项" checked={allUpdateableSelected} disabled={updateable.length === 0 || updatingNames.length > 0} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectNames(event.target.checked ? updateable.map((status) => status.source.directoryName) : [])} /></span>
            <span>Skill</span><span>本地版本</span><span>远端状态</span><span>最近检查</span><span className="table-action-heading">操作</span>
          </div>
          {statuses.length === 0 && (
            <div className="empty-state update-empty-state">
              <span className="empty-state-icon"><RefreshCcw size={18} /></span>
              <strong>暂无可检查的 skills.sh Skill</strong>
              <small>从技能市场安装的 Skill 会出现在这里，用于检查和执行更新。</small>
              <Button onClick={onOpenMarket}>去技能市场</Button>
            </div>
          )}
          {statuses.map((status) => {
            const directoryName = status.source.directoryName;
            const checked = selectedNames.includes(directoryName);
            const updateableStatus = status.status === "update_available";
            return (
              <div className="table-row update-grid" key={directoryName}>
                <span><input type="checkbox" aria-label={`选择 ${directoryName}`} disabled={!updateableStatus || updatingNames.length > 0} checked={updateableStatus && checked} onClick={(event) => event.stopPropagation()} onChange={(event) => toggleUpdateSelection(directoryName, event.target.checked)} /></span>
                <span className="title-cell"><strong>{status.name}</strong><small>{status.source.packageSlug}</small></span>
                <span className="path">{status.source.installedHash}</span>
                <SkillStatusIndicator status={status.status} label={updateStatusLabel(status.status)} />
                <span>{status.source.lastCheckedAt || "未检查"}</span>
                <span className="row-actions table-actions">
                  <Button disabled={!updateableStatus || updatingNames.includes(directoryName)} onClick={() => onUpdateOne(directoryName)}>
                    {updatingNames.includes(directoryName) ? "更新中" : "更新"}
                  </Button>
                </span>
              </div>
            );
          })}
        </Panel>
        <Panel className="detail-panel">
          <DetailHeader title={updateable.length === 0 ? "等待可更新项" : "批量更新确认"} />
          <p className="description">
            {updateable.length === 0
              ? "检查后发现可更新 Skill 时，可在左侧选择并批量更新。"
              : `已选择 ${selectedUpdateable.length} 个可更新 Skill。批量更新逐项执行，单项失败会保留旧版本并继续处理其他项。`}
          </p>
          <div className="warning">更新不会自动启用到任何 Agent 工具目录；已启用的 Copy 副本也不会在本次自动重同步。</div>
          {results.length > 0 && (
            <div className="update-result-list">
              <h3>最近结果</h3>
              {results.map((result) => (
                <div key={result.directoryName}><strong>{result.directoryName}</strong><small>{result.message}</small></div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function marketItemStatus(item: SkillMarketItem): SkillUpdateState {
  if (!item.installable) return "unsupported";
  if (item.updateStatus === "update_available") return "update_available";
  if (item.installedDirectoryName) return "installed";
  return "not_installed";
}

function marketRepositoryUrl(item: SkillMarketItem) {
  return item.installable ? `https://github.com/${item.source}` : "";
}

function localMarketDetail(item: SkillMarketItem): SkillMarketDetail {
  return {
    item,
    repositoryUrl: "",
    installCommand: `npx -y skills add ${item.source} --skill ${item.skillId} -g --agent codex -y --copy`,
    skillMarkdownPreview: "",
    securityNote: "该来源不是 GitHub owner/repo 格式，Workbench 暂不请求远程详情，也不支持安装。"
  };
}

function buildMarketStats(items: SkillMarketItem[]) {
  return items.reduce(
    (stats, item) => {
      stats.total += 1;
      if (!item.installable) {
        stats.unsupported += 1;
      } else if (item.updateStatus === "update_available") {
        stats.updateAvailable += 1;
        stats.installed += 1;
      } else if (item.installedDirectoryName) {
        stats.installed += 1;
      } else {
        stats.notInstalled += 1;
      }
      return stats;
    },
    { total: 0, installed: 0, notInstalled: 0, updateAvailable: 0, unsupported: 0 }
  );
}

function updateStatusLabel(status: SkillUpdateState) {
  if (status === "update_available") return "可更新";
  if (status === "up_to_date") return "已是最新";
  if (status === "check_failed") return "检查失败";
  if (status === "unsupported") return "不支持";
  if (status === "installed") return "未检查";
  return "未安装";
}

function formatInstallCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function SwitchControl({
  checked,
  onChange,
  title
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <label className="switch-control" title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch" />
    </label>
  );
}

function GlobalToolIcons({
  skill,
  tools,
  onToggle
}: {
  skill: Skill;
  tools: ToolTarget[];
  onToggle: (tool: ToolKey, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleTools = tools.slice(0, 4);
  const hiddenTools = tools.slice(4);
  const renderToolButton = (tool: ToolTarget) => {
    const state = skill.globalToolStates.find((entry) => entry.tool === tool.key);
    const enabled = state?.status === "managed";
    const conflict = state?.status === "conflict";
    return (
      <button
        className={`${enabled ? "managed" : ""} ${conflict ? "conflict" : ""}`}
        key={tool.key}
        title={`${tool.name} · ${globalStatusLabel(state)}`}
        onClick={(event) => {
          event.stopPropagation();
          if (!conflict) onToggle(tool.key, !enabled);
        }}
      >
        <ToolIcon tool={tool} />
      </button>
    );
  };

  return (
    <span className="tool-icons">
      {visibleTools.map(renderToolButton)}
      {hiddenTools.length > 0 && (
        <span className="tool-more">
          <button
            className="more"
            title="显示全部工具"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => !current);
            }}
          >
            +{hiddenTools.length}
          </button>
          {expanded && (
            <span className="tool-more-popover" onClick={(event) => event.stopPropagation()}>
              {tools.map((tool) => (
                <span className="tool-more-row" key={tool.key}>
                  {renderToolButton(tool)}
                  <small>{tool.name}</small>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function SkillCategorySelect({
  skillName,
  categoryId,
  categories,
  onSave,
  onCreate
}: {
  skillName: string;
  categoryId: string;
  categories: SkillCategory[];
  onSave: (categoryId: string) => void;
  onCreate: (name: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue("");
    setCreating(false);
  }, [categoryId]);

  function save() {
    const next = value.trim();
    setCreating(false);
    if (next) onCreate(next);
  }

  if (creating) {
    return (
      <input
        className="inline-category-input"
        aria-label="新分类名称"
        autoFocus
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setValue("");
            setCreating(false);
          }
        }}
      />
    );
  }

  return (
    <select
      className="inline-category-select"
      aria-label={`${skillName} 分类`}
      value={categoryId}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        if (event.target.value === "__new__") {
          setValue("");
          setCreating(true);
          return;
        }
        onSave(event.target.value);
      }}
    >
      {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      <option value="__new__">新建分类...</option>
    </select>
  );
}

export function SkillCategoryDialog({
  categories,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onMerge
}: {
  categories: SkillCategory[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (categoryId: string, name: string) => void;
  onDelete: (categoryId: string, replacementCategoryId: string) => void;
  onMerge: (sourceCategoryId: string, targetCategoryId: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [actionCategoryId, setActionCategoryId] = useState("");
  const [actionKind, setActionKind] = useState<"delete" | "merge" | "">("");
  const [targetCategoryId, setTargetCategoryId] = useState("uncategorized");
  const targetOptions = categories.filter((category) => category.id !== actionCategoryId);

  function submitNew(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  }

  function startRename(category: SkillCategory) {
    setEditingId(category.id);
    setEditingName(category.name);
    setActionKind("");
    setActionCategoryId("");
  }

  function saveRename(category: SkillCategory) {
    const name = editingName.trim();
    setEditingId("");
    if (name && name !== category.name) onRename(category.id, name);
  }

  function startAction(category: SkillCategory, kind: "delete" | "merge") {
    setActionCategoryId(category.id);
    setActionKind(kind);
    setEditingId("");
    setTargetCategoryId(categories.find((item) => item.id !== category.id)?.id ?? "uncategorized");
  }

  function confirmAction() {
    if (!actionCategoryId || !targetCategoryId) return;
    if (actionKind === "delete") onDelete(actionCategoryId, targetCategoryId);
    if (actionKind === "merge") onMerge(actionCategoryId, targetCategoryId);
    setActionKind("");
    setActionCategoryId("");
  }

  const actionCategory = categories.find((category) => category.id === actionCategoryId);

  return (
    <Modal
      title="管理分类"
      description="分类只用于 Workbench 内整理，删除或合并分类不会删除 Skills。"
      large
      onClose={onClose}
      footer={<><Button onClick={onClose}>关闭</Button></>}
    >
      <form className="category-create-row" onSubmit={submitNew}>
        <input aria-label="新分类名称" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="新分类名称" />
        <Button variant="primary" type="submit"><Plus size={14} />新增分类</Button>
      </form>
      {actionCategory && actionKind && (
        <div className="category-action-panel">
          <span>
            <strong>{actionKind === "delete" ? "删除分类" : "合并分类"}：{actionCategory.name}</strong>
            <small>{actionKind === "delete" ? "删除前会把该分类下的 Skills 移动到目标分类。" : "合并后源分类会删除，Skills 移动到目标分类。"}</small>
          </span>
          <select aria-label="目标分类" value={targetCategoryId} onChange={(event) => setTargetCategoryId(event.target.value)}>
            {targetOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <Button variant={actionKind === "delete" ? "danger" : "primary"} onClick={confirmAction}>
            {actionKind === "delete" ? "确认删除" : "确认合并"}
          </Button>
        </div>
      )}
      <div className="category-manager-table">
        <div className="category-manager-head">
          <span>分类</span>
          <span>Skills</span>
          <span>操作</span>
        </div>
        {categories.map((category) => {
          const isSystem = category.id === "uncategorized";
          return (
            <div className="category-manager-row" key={category.id}>
              <span className="category-name-cell">
                {editingId === category.id ? (
                  <input
                    aria-label={`${category.name} 新名称`}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={() => saveRename(category)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveRename(category);
                      if (event.key === "Escape") setEditingId("");
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="category-title-line">
                    <strong>{category.name}</strong>
                    {isSystem && <em>系统</em>}
                  </span>
                )}
              </span>
              <span className="category-count-badge">{category.skillCount} 个</span>
              <ActionGroup className="row-actions">
                <IconButton title={`重命名 ${category.name}`} disabled={isSystem} onClick={() => startRename(category)}>
                  <Edit3 size={14} />
                </IconButton>
                <Button disabled={isSystem} onClick={() => startAction(category, "merge")}>合并</Button>
                <IconButton variant="danger" title={`删除 ${category.name}`} disabled={isSystem} onClick={() => startAction(category, "delete")}>
                  <Trash2 size={14} />
                </IconButton>
              </ActionGroup>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function SkillConflictPanel({
  skill,
  settings,
  onResolve
}: {
  skill: Skill;
  settings: AppSettings;
  onResolve: (source: SkillVersionSource) => void;
}) {
  const [selectedSource, setSelectedSource] = useState<SkillVersionSource>("workbench");
  const candidates = [
    {
      source: "workbench" as const,
      label: ".workbench",
      path: skill.skillPath.replace(/[\\/][^\\/]+$/, ""),
      available: true
    },
    ...settings.toolTargets.map((tool) => {
      const state = skill.globalToolStates.find((entry) => entry.tool === tool.key);
      return {
        source: tool.key as SkillVersionSource,
        label: `.${tool.key}`,
        path: `${tool.globalSkillsDir}\\${skill.directoryName}`,
        available: Boolean(state && state.status !== "disabled")
      };
    })
  ];

  useEffect(() => {
    if (!candidates.some((candidate) => candidate.source === selectedSource && candidate.available)) {
      setSelectedSource("workbench");
    }
  }, [candidates, selectedSource]);

  const selectedCandidate = candidates.find((candidate) => candidate.source === selectedSource);
  return (
    <div className="skill-conflict-panel">
      <div className="conflict-panel-title">
        <span>
          <strong>检测到多个版本不一致</strong>
          <small>选择一个版本作为唯一来源，应用后会统一同步到已存在的全局工具目录。</small>
        </span>
        <StatusBadge tone="danger">内容冲突</StatusBadge>
      </div>
      <div className="version-options">
        {candidates.map((candidate) => (
          <label key={candidate.source} className={!candidate.available ? "disabled" : ""}>
            <input
              type="radio"
              name={`${skill.id}-version-source`}
              checked={selectedSource === candidate.source}
              disabled={!candidate.available}
              onChange={() => setSelectedSource(candidate.source)}
            />
            <span>
              <strong>{candidate.label}</strong>
              <small>{candidate.available ? candidate.path : "不存在或未启用"}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="conflict-panel-actions">
        <Button
          variant="primary"
          disabled={!selectedCandidate?.available}
          onClick={() => onResolve(selectedSource)}
        >
          应用选择
        </Button>
        <button onClick={() => void workbenchApi.openSkillSourceDirectory(skill.directoryName)}>打开 .workbench</button>
      </div>
    </div>
  );
}

export function RadarView({
  items,
  duplicateGroups,
  selectedItem,
  loading,
  loadError,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenLink,
  syncingGithubStars,
  onSyncGithubStars,
  onMergeDuplicateGroup
}: {
  items: RadarItem[];
  duplicateGroups: RadarDuplicateGroup[];
  selectedItem?: RadarItem;
  loading: boolean;
  loadError: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (item: RadarItem) => void;
  onDelete: (item: RadarItem) => void;
  onToggleFavorite: (item: RadarItem) => void;
  onOpenLink: (url: string) => void;
  syncingGithubStars: boolean;
  onSyncGithubStars: () => void;
  onMergeDuplicateGroup: (groupId: string, primaryItemId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部分类");
  const [domain, setDomain] = useState("全部领域");
  const [source, setSource] = useState("全部来源");
  const [language, setLanguage] = useState("全部语言");
  const [sourceState, setSourceState] = useState("全部状态");
  const [duplicateState, setDuplicateState] = useState("全部重复状态");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const categories = useMemo(() => ["全部分类", "项目", "资讯", "论文", "其他"], []);
  const domains = useMemo(() => ["全部领域", ...Array.from(new Set([...radarDomains, ...items.map((item) => item.domain || "未分类")]))], [items]);
  const languages = useMemo(
    () => ["全部语言", ...Array.from(new Set(items.map((item) => item.sourceMetadata.language).filter(Boolean))).sort()],
    [items]
  );
  const duplicateCandidateIds = useMemo(
    () => new Set(duplicateGroups.flatMap((group) => group.candidateIds)),
    [duplicateGroups]
  );
  const filteredItems = items.filter((item) => {
    const displayTags = [...new Set([...item.tags, ...item.sourceMetadata.topics])];
    const itemSources = item.sources.length > 0 ? item.sources : [item.source];
    const isDuplicateCandidate = duplicateCandidateIds.has(item.id);
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.note.toLowerCase().includes(normalizedQuery) ||
      item.sourceDescription.toLowerCase().includes(normalizedQuery) ||
      displayTags.some((itemTag) => itemTag.toLowerCase().includes(normalizedQuery));
    return (
      matchesQuery &&
      (category === "全部分类" || item.category === category) &&
      (domain === "全部领域" || item.domain === domain) &&
      (source === "全部来源" || itemSources.includes(source as RadarItem["source"])) &&
      (language === "全部语言" || item.sourceMetadata.language === language) &&
      (sourceState === "全部状态" || (sourceState === "来源有效" ? item.sourceActive : !item.sourceActive)) &&
      (duplicateState === "全部重复状态" || (duplicateState === "待合并" ? isDuplicateCandidate : !isDuplicateCandidate)) &&
      (!favoritesOnly || item.favorite)
    );
  });
  const visibleSelectedItem = filteredItems.find((item) => item.id === selectedItem?.id);

  return (
    <section className="view">
      <PageHeader
        title="资源 Radar"
        description={`${items.length} 条本地记录`}
        actions={<div className="header-actions"><Button disabled={syncingGithubStars} onClick={onSyncGithubStars}><RefreshCcw size={15} />{syncingGithubStars ? "同步中" : "同步 GitHub Stars"}</Button><Button variant="primary" onClick={onAdd}><Plus size={15} />添加条目</Button></div>}
      />
      <Toolbar>
        <SearchInput placeholder="搜索名称、标签或备注" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="按分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select aria-label="按领域筛选" value={domain} onChange={(event) => setDomain(event.target.value)}>
          {domains.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select aria-label="按来源筛选" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="全部来源">全部来源</option>
          <option value="manual">手动添加</option>
          <option value="github_star">GitHub Stars</option>
        </select>
        <FilterMore expanded={showMoreFilters} onToggle={() => setShowMoreFilters((value) => !value)}>
              <select aria-label="按语言筛选" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {languages.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select aria-label="按来源状态筛选" value={sourceState} onChange={(event) => setSourceState(event.target.value)}>
                <option>全部状态</option>
                <option>来源有效</option>
                <option>来源失效</option>
              </select>
              <select aria-label="按重复状态筛选" value={duplicateState} onChange={(event) => setDuplicateState(event.target.value)}>
                <option>全部重复状态</option>
                <option>待合并</option>
                <option>非重复项</option>
              </select>
        </FilterMore>
        <Button
          className={`favorite-filter ${favoritesOnly ? "active" : ""}`}
          aria-label={favoritesOnly ? "显示全部资源" : "仅显示收藏资源"}
          title={favoritesOnly ? "显示全部资源" : "仅显示收藏资源"}
          onClick={() => setFavoritesOnly((value) => !value)}
        >
          <Star size={16} fill="currentColor" />
        </Button>
      </Toolbar>
      {duplicateGroups.length > 0 && (
        <div className="radar-duplicate-stack" aria-label="待合并来源">
          {duplicateGroups.map((group) => (
            <section key={group.id} className="skill-conflict-panel radar-duplicate-panel">
              <div className="conflict-panel-title">
                <span>
                  <strong>发现可能重复的 GitHub Stars 来源</strong>
                  <small>{group.externalId} 匹配到 {group.candidates.length} 个手动资源。选择保留的主资源后，来源、标签、备注和收藏会合并。</small>
                </span>
              </div>
              <div className="version-options">
                {group.candidates.map((candidate) => (
                  <label key={candidate.id}>
                    <input type="radio" name={`duplicate-${group.id}`} defaultChecked={candidate.id === group.candidateIds[0]} readOnly />
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>{candidate.category} · {candidate.domain || "未分类"} · {candidate.url || "无链接"}</small>
                    </span>
                    <Button onClick={() => onMergeDuplicateGroup(group.id, candidate.id)}>合并到此</Button>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="split-layout">
        <Panel className="list-panel card-list">
          {loading && (
            <div className="empty-state">
              <strong>正在加载资源 Radar</strong>
              <small>正在读取 Workbench 本地数据库。</small>
            </div>
          )}
          {!loading && loadError && (
            <div className="empty-state">
              <strong>资源 Radar 加载失败</strong>
              <small>{loadError}</small>
            </div>
          )}
          {!loading && !loadError && filteredItems.length === 0 && (
            <div className="empty-state">
              <strong>{items.length === 0 ? "暂无资源条目" : "没有匹配的条目"}</strong>
              <small>{items.length === 0 ? "点击“添加条目”记录资源，或同步 GitHub Stars。" : "调整搜索词或筛选条件后重试。"}</small>
            </div>
          )}
          {!loading && !loadError && filteredItems.map((item) => (
            <div
              key={item.id}
              className={`row-card ${visibleSelectedItem?.id === item.id ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item.id);
                }
              }}
            >
              <span className="row-main">
                <strong>{item.name}</strong>
                <ActionGroup className="row-actions">
                  <button
                    className={`favorite-star ${item.favorite ? "active" : ""}`}
                    aria-label={item.favorite ? `取消收藏 ${item.name}` : `收藏 ${item.name}`}
                    title={item.favorite ? "取消收藏" : "收藏"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(item);
                    }}
                  >
                    <Star size={15} fill="currentColor" />
                  </button>
                  <IconButton
                    variant="danger"
                    title="删除条目"
                    aria-label={`删除 ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(item);
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </ActionGroup>
              </span>
              <span className="meta-line">{item.category} · {item.domain || "未分类"} · {radarSourceLabel(item)}{item.sourceMetadata.language ? ` · ${item.sourceMetadata.language}` : ""}{item.source === "github_star" ? ` · ★ ${item.sourceMetadata.stars}` : ""} · {item.updatedAt}</span>
              <p>{item.note || item.sourceDescription}</p>
              {!item.sourceActive && <StatusBadge tone="danger">GitHub Stars 来源已失效</StatusBadge>}
              {duplicateCandidateIds.has(item.id) && <StatusBadge tone="warning">待合并重复来源</StatusBadge>}
            </div>
          ))}
        </Panel>
        <Panel className="detail-panel">
          {visibleSelectedItem ? (
            <>
              <DetailHeader
                title={visibleSelectedItem.name}
                description={`${visibleSelectedItem.category} · ${visibleSelectedItem.domain || "未分类"} · ${radarSourceLabel(visibleSelectedItem)}${visibleSelectedItem.sourceActive ? "" : " · 来源已失效"}`}
                actions={
                  <IconButton
                    title="编辑条目"
                    aria-label="编辑条目"
                    onClick={() => onEdit(visibleSelectedItem)}
                  >
                    <Edit3 size={15} />
                  </IconButton>
                }
              />
              <div className="form-grid">
                <label>名称<input value={visibleSelectedItem.name} readOnly /></label>
                <label>分类<input value={visibleSelectedItem.category} readOnly /></label>
                <label>领域<input value={visibleSelectedItem.domain || "未分类"} readOnly /></label>
                <label>来源<input value={radarSourceLabel(visibleSelectedItem)} readOnly /></label>
                <label className="full">链接<span className="field-with-action"><input value={visibleSelectedItem.url} readOnly /><IconButton title="打开链接" aria-label="打开链接" onClick={() => onOpenLink(visibleSelectedItem.url)} disabled={!visibleSelectedItem.url}><ExternalLink size={15} /></IconButton></span></label>
                <label>标签<input value={visibleSelectedItem.tags.join(", ")} readOnly /></label>
                <label>更新时间<input value={visibleSelectedItem.updatedAt} readOnly /></label>
                {visibleSelectedItem.source === "github_star" && <><label>语言<input value={visibleSelectedItem.sourceMetadata.language || "未知"} readOnly /></label><label>GitHub Stars<input value={visibleSelectedItem.sourceMetadata.stars} readOnly /></label><label className="full">GitHub Topics<input value={visibleSelectedItem.sourceMetadata.topics.join(", ")} readOnly /></label><label className="full">来源描述<textarea rows={3} value={visibleSelectedItem.sourceDescription} readOnly /></label></>}
                <label className="full">备注<textarea rows={5} value={visibleSelectedItem.note} readOnly /></label>
              </div>
            </>
          ) : (
            <div className="empty-state detail-empty">
              <strong>选择一个资源条目</strong>
              <small>查看详情、收藏或打开链接。</small>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

export function SettingsView({
  settings,
  theme,
  onOpenUpdateDetails,
  onThemeToggle,
  onRootChange,
  onReorderToolTargets,
  onAddCustomTool,
  onEditCustomTool,
  onDeleteCustomTool,
  onCloseBehaviorChange,
  onOpenPath,
  onAddProjectOpenProfile,
  onEditProjectOpenProfile,
  onDeleteProjectOpenProfile
}: {
  settings: AppSettings;
  theme: "light" | "dark";
  onOpenUpdateDetails: () => void;
  onThemeToggle: () => void;
  onRootChange: (path: string) => void;
  onReorderToolTargets: (toolKeys: ToolKey[]) => void;
  onAddCustomTool: () => void;
  onEditCustomTool: (tool: ToolTarget) => void;
  onDeleteCustomTool: (tool: ToolTarget) => void;
  onCloseBehaviorChange: (behavior: CloseBehavior) => void;
  onOpenPath: (path: string) => void;
  onAddProjectOpenProfile: () => void;
  onEditProjectOpenProfile: (profile: ProjectOpenProfile) => void;
  onDeleteProjectOpenProfile: (profile: ProjectOpenProfile) => void;
}) {
  const moveToolTarget = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= settings.toolTargets.length) return;
    const nextTools = [...settings.toolTargets];
    [nextTools[index], nextTools[nextIndex]] = [nextTools[nextIndex], nextTools[index]];
    onReorderToolTargets(nextTools.map((tool) => tool.key));
  };

  return (
    <section className="view">
      <PageHeader title="设置" description="管理本地路径、工具目录与主题" />
      <div className="settings-stack">
        <AppUpdatePanel onOpenDetails={onOpenUpdateDetails} />
        <section className="settings-panel">
          <h2>Skills 存储</h2>
          <p>Workbench Skills 根目录是所有 Skill 的唯一真实来源。</p>
          <div className="settings-row path-setting-row">
            <div className="settings-path-field">
              <label htmlFor="settings-skills-root">统一 Skills 根目录</label>
              <span className="settings-path-control">
                <input
                  id="settings-skills-root"
                  key={settings.skillsRoot}
                  defaultValue={settings.skillsRoot}
                  onBlur={(event) => {
                    const path = event.target.value.trim();
                    if (path && path !== settings.skillsRoot) onRootChange(path);
                  }}
                />
                <IconButton title="打开 Skills 根目录" onClick={() => onOpenPath(settings.skillsRoot)}><FolderOpen size={15} /></IconButton>
              </span>
            </div>
          </div>
        </section>
        <section className="settings-panel">
          <div className="settings-panel-title">
            <span>
              <h2>支持的工具目录</h2>
              <p>Workbench 通过符号链接为以下工具启用 Skills，展示顺序会影响 Skills 表格的全局工具列。</p>
            </span>
            <Button onClick={onAddCustomTool}><Plus size={15} />添加工具</Button>
          </div>
          {settings.toolTargets.map((tool, index) => (
            <div className="settings-row" key={tool.key}>
              <span className="settings-tool-identity">
                <span className="settings-tool-icon"><ToolIcon tool={tool} /></span>
                <span>
                  <strong>{tool.name}</strong>
                  <small>{tool.globalSkillsDir}</small>
                </span>
              </span>
              <span className="settings-row-actions">
                <StatusBadge tone={tool.source === "custom" ? "attention" : "neutral"}>{tool.source === "custom" ? "自定义" : "内置"}</StatusBadge>
                <IconButton title={`上移 ${tool.name}`} disabled={index === 0} onClick={() => moveToolTarget(index, -1)}><ArrowUp size={15} /></IconButton>
                <IconButton title={`下移 ${tool.name}`} disabled={index === settings.toolTargets.length - 1} onClick={() => moveToolTarget(index, 1)}><ArrowDown size={15} /></IconButton>
                <IconButton title={`打开 ${tool.name} Skills 目录`} onClick={() => onOpenPath(tool.globalSkillsDir)}><FolderOpen size={15} /></IconButton>
                {tool.source === "custom" && <IconButton title={`编辑 ${tool.name}`} onClick={() => onEditCustomTool(tool)}><Edit3 size={15} /></IconButton>}
                {tool.source === "custom" && <IconButton variant="danger" title={`删除 ${tool.name}`} onClick={() => onDeleteCustomTool(tool)}><Trash2 size={15} /></IconButton>}
                <StatusBadge tone={tool.available ? "accent" : "neutral"}>{tool.available ? "可用" : "不可用"}</StatusBadge>
              </span>
            </div>
          ))}
        </section>
        <section className="settings-panel">
          <div className="settings-panel-title">
            <span>
              <h2>项目打开方式</h2>
              <p>配置项目列表中的“用工具打开”菜单。命令会优先使用 PATH，也可以选择 exe 作为兜底。</p>
            </span>
            <Button onClick={onAddProjectOpenProfile}><Plus size={15} />添加</Button>
          </div>
          {settings.projectOpenProfiles.map((profile) => (
            <div className="settings-row" key={profile.id}>
              <span>
                <strong>{profile.name}</strong>
                <small>{projectOpenProfileSummary(profile)}</small>
              </span>
              <span className="settings-row-actions">
                <StatusBadge tone={profile.enabled ? "accent" : "neutral"}>{profile.enabled ? "启用" : "停用"}</StatusBadge>
                <StatusBadge tone={profile.kind === "terminal" ? "attention" : "neutral"}>{profile.kind === "terminal" ? "终端" : "应用"}</StatusBadge>
                <IconButton title={`编辑 ${profile.name}`} onClick={() => onEditProjectOpenProfile(profile)}><Edit3 size={15} /></IconButton>
                <IconButton variant="danger" title={`删除 ${profile.name}`} onClick={() => onDeleteProjectOpenProfile(profile)}><Trash2 size={15} /></IconButton>
              </span>
            </div>
          ))}
          {settings.projectOpenProfiles.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>暂无打开方式</strong>
              <small>添加 VS Code、Trae 或 Claude Code 等工具后，可从项目列表快速打开。</small>
            </div>
          )}
        </section>
        <section className="settings-panel">
          <h2>Skills 路径映射</h2>
          <p>真实副本、全局链接和项目链接保持单一来源关系。</p>
          <div className="path-map">
            <div><small>真实副本</small><strong>{settings.skillsRoot}\\*\\SKILL.md</strong></div>
            <div><small>全局链接</small><strong>工具全局 skills 目录中的符号链接</strong></div>
            <div><small>项目链接</small><strong>受支持项目内工具 skills 目录中的符号链接</strong></div>
          </div>
        </section>
        <section className="settings-panel">
          <h2>本地数据</h2>
          <p>项目、分类和资源 Radar 数据保存在系统应用数据目录。</p>
          <div className="settings-row">
            <span><small>Workbench 根目录</small>{settings.workbenchRoot}</span>
            <IconButton title="打开 Workbench 根目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
          </div>
          <div className="settings-row">
            <span><small>SQLite 数据库</small>{settings.workbenchRoot}\\workbench.sqlite</span>
            <IconButton title="打开数据库所在目录" onClick={() => onOpenPath(settings.workbenchRoot)}><FolderOpen size={15} /></IconButton>
          </div>
        </section>
        <section className="settings-panel">
          <h2>应用行为</h2>
          <p>控制关闭窗口时的处理方式。</p>
          <div className="settings-row">
            <span><small>关闭窗口时</small><strong>{closeBehaviorLabel(settings.closeBehavior)}</strong></span>
            <select
              aria-label="关闭窗口时"
              className="settings-select"
              value={settings.closeBehavior}
              onChange={(event) => onCloseBehaviorChange(event.target.value as CloseBehavior)}
            >
              <option value="hide_to_tray">隐藏到托盘</option>
              <option value="exit">退出应用</option>
            </select>
          </div>
        </section>
        <section className="settings-panel">
          <h2>主题背景</h2>
          <p>切换 Workbench 的浅色或深色界面。</p>
          <div className="settings-row"><span><small>当前主题</small><strong>{theme === "dark" ? "深色主题" : "浅色主题"}</strong></span><Button onClick={onThemeToggle}>切换主题</Button></div>
        </section>
        <div className="notice">符号链接目标已存在时，Workbench 不会覆盖或删除已有内容。</div>
      </div>
    </section>
  );
}

function projectOpenProfileSummary(profile: ProjectOpenProfile) {
  const command = profile.executablePath || profile.command || "未配置命令";
  const args = profile.args.length ? ` ${profile.args.join(" ")}` : "";
  return `${command}${args}`;
}

function closeBehaviorLabel(behavior: CloseBehavior) {
  if (behavior === "exit") return "退出应用";
  return "隐藏到托盘";
}

export function CustomToolDialog({
  tool,
  existingTools,
  onSelectDirectory,
  onSelectIcon,
  onError,
  onSubmit,
  onClose
}: {
  tool?: ToolTarget;
  existingTools: ToolTarget[];
  onSelectDirectory: () => Promise<string | null>;
  onSelectIcon: () => Promise<string | null>;
  onError: (message: string) => void;
  onSubmit: (input: CustomToolTargetInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(tool?.name ?? "");
  const [globalSkillsDir, setGlobalSkillsDir] = useState(tool?.globalSkillsDir ?? "");
  const [iconSourcePath, setIconSourcePath] = useState("");
  const [formError, setFormError] = useState("");
  const iconPreview = iconSourcePath || tool?.iconPath || "";

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDir = globalSkillsDir.trim();
    if (!trimmedName) {
      setFormError("工具名称不能为空");
      return;
    }
    const duplicateName = existingTools.some((item) => item.key !== tool?.key && item.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicateName) {
      setFormError("工具名称已存在");
      return;
    }
    if (!trimmedDir) {
      setFormError("全局 Skills 目录不能为空");
      return;
    }
    if (!isLikelyAbsolutePath(trimmedDir)) {
      setFormError("全局 Skills 目录必须是绝对路径");
      return;
    }
    setFormError("");
    onSubmit({
      key: tool?.key ?? null,
      name: trimmedName,
      globalSkillsDir: trimmedDir,
      iconSourcePath: iconSourcePath || null,
      iconPath: tool?.iconPath ?? null
    });
  }

  return (
    <Modal
      title={tool ? "编辑自定义工具" : "添加自定义工具"}
      description="为暂未内置支持的终端型 Coding Agent 配置全局 Skills 目录。"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" type="submit" form="custom-tool-form">保存</Button></>}
    >
      <form id="custom-tool-form" className="dialog-form" onSubmit={submit}>
        {formError && <p className="field-error full">{formError}</p>}
        <label>工具名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="My Agent" /></label>
        <label className="full">全局 Skills 目录<span className="field-with-action"><input value={globalSkillsDir} onChange={(event) => setGlobalSkillsDir(event.target.value)} placeholder={"C:\\Users\\name\\.my-agent\\skills"} /><IconButton title="选择目录" type="button" onClick={async () => {
          try {
            const path = await onSelectDirectory();
            if (path) setGlobalSkillsDir(path);
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          }
        }}><FolderOpen size={15} /></IconButton></span></label>
        <label className="full">工具图标<span className="field-with-action"><input value={iconPreview} readOnly placeholder="可选：png / jpg / webp / ico / svg" /><IconButton title="选择图标" type="button" onClick={async () => {
          try {
            const path = await onSelectIcon();
            if (path) setIconSourcePath(path);
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          }
        }}><FolderOpen size={15} /></IconButton></span></label>
        {iconPreview && <div className="tool-icon-preview full"><span><ToolIcon tool={{ key: tool?.key ?? (name || "CT"), name, globalSkillsDir, supportsProjectScope: false, available: false, source: "custom", iconPath: iconPreview }} /></span><code>{iconPreview}</code></div>}
        <div className="notice full">自定义工具仅支持全局启用。删除自定义工具只移除 Workbench 配置和启用记录，不会删除外部工具目录。</div>
      </form>
    </Modal>
  );
}

function isLikelyAbsolutePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}

function DeleteCustomToolDialog({
  tool,
  onClose,
  onConfirm
}: {
  tool: ToolTarget;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除自定义工具"
      description={`确认删除 ${tool.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除"
    >
      <p>Workbench 会移除该工具的配置、排序和启用记录，但不会删除外部 Skills 目录。</p>
      <div className="file-block"><span>全局 Skills 目录</span><code>{tool.globalSkillsDir}</code></div>
    </ConfirmDeleteModal>
  );
}

function ProjectOpenProfileDialog({
  profile,
  nextSortOrder,
  onSelectExecutable,
  onError,
  onSubmit,
  onClose
}: {
  profile?: ProjectOpenProfile;
  nextSortOrder: number;
  onSelectExecutable: () => Promise<string | null>;
  onError: (message: string) => void;
  onSubmit: (profile: ProjectOpenProfile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [kind, setKind] = useState<ProjectOpenProfile["kind"]>(profile?.kind ?? "app");
  const [command, setCommand] = useState(profile?.command ?? "");
  const [executablePath, setExecutablePath] = useState(profile?.executablePath ?? "");
  const [argsText, setArgsText] = useState((profile?.args ?? ["{projectPath}"]).join("\n"));
  const [workdir, setWorkdir] = useState(profile?.workdir ?? "{projectPath}");
  const [enabled, setEnabled] = useState(profile?.enabled ?? true);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    const trimmedExecutablePath = executablePath.trim();
    if (!trimmedName) {
      onError("打开方式名称不能为空");
      return;
    }
    if (!trimmedCommand && !trimmedExecutablePath) {
      onError("打开方式未配置命令或可执行文件路径。");
      return;
    }
    onSubmit({
      id: profile?.id ?? createProjectOpenProfileId(trimmedName),
      name: trimmedName,
      kind,
      command: trimmedCommand,
      executablePath: trimmedExecutablePath,
      args: argsText.split(/\r?\n/).map((arg) => arg.trim()).filter(Boolean),
      workdir: workdir.trim() || "{projectPath}",
      enabled,
      sortOrder: profile?.sortOrder ?? nextSortOrder
    });
  }

  return (
    <Modal
      title={profile ? "编辑打开方式" : "添加打开方式"}
      description="命令会优先从 PATH 启动；如果工具没有加入 PATH，可以选择 exe 文件作为兜底。"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" type="submit" form="project-open-profile-form">保存</Button></>}
    >
      <form id="project-open-profile-form" className="dialog-form" onSubmit={submit}>
        <label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Trae" /></label>
        <label>类型<select value={kind} onChange={(event) => setKind(event.target.value as ProjectOpenProfile["kind"])}><option value="app">应用</option><option value="terminal">终端命令</option></select></label>
        <label>命令<input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={kind === "terminal" ? "claude" : "trae"} /></label>
        <label className="full">可执行文件路径<span className="field-with-action"><input value={executablePath} onChange={(event) => setExecutablePath(event.target.value)} placeholder="可选：选择 trae.exe / Code.exe" /><IconButton title="选择程序" type="button" onClick={async () => {
          try {
            const path = await onSelectExecutable();
            if (path) setExecutablePath(path);
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          }
        }}><FolderOpen size={15} /></IconButton></span></label>
        <label className="full">参数<textarea rows={3} value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder={"每行一个参数，例如：\n-c\n--skip-agreement"} /></label>
        <label>工作目录<input value={workdir} onChange={(event) => setWorkdir(event.target.value)} placeholder="留空默认使用项目目录；可填写 {projectPath}\\subdir" /></label>
        <label className="checkbox-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />启用此打开方式</label>
        <div className="notice full">命令会在“工作目录”中启动。<code>{"{projectPath}"}</code> 表示当前项目路径；只有工具要求项目路径作为参数时，才在参数中填写它。</div>
      </form>
    </Modal>
  );
}

function DeleteProjectOpenProfileDialog({
  profile,
  onClose,
  onConfirm
}: {
  profile: ProjectOpenProfile;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除打开方式"
      description={`确认删除 ${profile.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除"
    >
      <p>删除后，该打开方式会从项目列表菜单中移除，不会卸载本机软件。</p>
      <div className="file-block"><span>命令</span><code>{projectOpenProfileSummary(profile)}</code></div>
    </ConfirmDeleteModal>
  );
}

function TrayHintDialog({
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Workbench 将继续运行"
      description="关闭窗口后会隐藏到系统托盘。"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onConfirm}>知道了</Button>
        </>
      }
    >
      <div className="tray-hint-card">
        <span className="tray-hint-icon"><MonitorUp size={18} /></span>
        <span>
          <strong>可从系统托盘恢复</strong>
          <small>右键托盘图标可重新显示 Workbench，或选择退出应用。这个提示只显示一次。</small>
        </span>
      </div>
    </Modal>
  );
}

function CreateDirectoryDialog({
  path,
  onClose,
  onConfirm
}: {
  path: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="创建目录"
      description="目标目录当前不存在。"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={onConfirm}>创建并打开</Button></>}
    >
      <div className="notice">是否创建对应的 Skills 目录？</div>
      <div className="file-block"><span>目录路径</span><code>{path}</code></div>
    </Modal>
  );
}

function customToolIconSource(path: string) {
  if (!path) return "";
  if (("__TAURI_INTERNALS__" in window) && (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/"))) {
    return convertFileSrc(path);
  }
  return path;
}

function ToolIcon({ tool }: { tool: ToolTarget }) {
  const source = tool.iconPath ? customToolIconSource(tool.iconPath) : toolIconSources[tool.key];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  if (source && !failed) return <img src={source} alt="" aria-hidden="true" onError={() => setFailed(true)} />;
  return <span aria-hidden="true">{tool.key.slice(0, 2).toUpperCase()}</span>;
}

export function ProjectDialog({
  project,
  onSelectDirectory,
  onError,
  onSubmit,
  onClose
}: {
  project?: Project;
  onSelectDirectory: () => Promise<string | null>;
  onError: (message: string) => void;
  onSubmit: (project: Project) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(project?.path ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [tags, setTags] = useState(project?.tags.join(", ") ?? "");
  const [launchConfigs, setLaunchConfigs] = useState<ProjectLaunchConfig[]>(
    project?.launchConfigs.length
      ? project.launchConfigs
      : [createLaunchConfig("默认", project?.path ?? "")]
  );
  const [note, setNote] = useState(project?.note ?? "");
  const [formError, setFormError] = useState("");
  const isEditing = Boolean(project);

  function handlePathChange(value: string) {
    setPath(value);
    if (!name.trim() || name === getProjectNameFromPath(path)) {
      setName(getProjectNameFromPath(value));
    }
    setLaunchConfigs((configs) =>
      configs.map((config) => ({
        ...config,
        workdir: !config.workdir.trim() || config.workdir === path ? value : config.workdir
      }))
    );
  }

  function updateLaunchConfig(id: string, patch: Partial<ProjectLaunchConfig>) {
    setLaunchConfigs((configs) =>
      configs.map((config) => config.id === id ? { ...config, ...patch } : config)
    );
  }

  function addLaunchConfig() {
    setLaunchConfigs((configs) => [...configs, createLaunchConfig(`启动项 ${configs.length + 1}`, path)]);
  }

  function removeLaunchConfig(id: string) {
    setLaunchConfigs((configs) => configs.length > 1 ? configs.filter((config) => config.id !== id) : configs);
  }

  async function chooseProjectPath() {
    try {
      const selectedPath = await onSelectDirectory();
      if (selectedPath) {
        handlePathChange(selectedPath);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法打开目录选择器");
    }
  }

  async function chooseLaunchWorkdir(id: string) {
    try {
      const selectedPath = await onSelectDirectory();
      if (selectedPath) {
        updateLaunchConfig(id, { workdir: selectedPath });
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法打开目录选择器");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setFormError("项目路径不能为空");
      return;
    }
    const trimmedName = name.trim() || getProjectNameFromPath(trimmedPath);
    if (!trimmedName) {
      setFormError("项目名称不能为空");
      return;
    }
    onSubmit({
      id: project?.id ?? createProjectId(trimmedName, trimmedPath),
      name: trimmedName,
      path: trimmedPath,
      note: note.trim(),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      archived: project?.archived ?? false,
      launchConfigs: launchConfigs
        .map((config) => ({
          ...config,
          name: config.name.trim() || "启动项",
          command: config.command.trim(),
          workdir: config.workdir.trim() || trimmedPath
        }))
        .filter((config) => config.name || config.command || config.workdir)
    });
  }

  return (
    <Modal
      title={isEditing ? "编辑项目" : "添加项目"}
      description="记录本地项目路径和启动方式"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button form="project-form" type="submit" variant="primary">{isEditing ? "保存" : "添加项目"}</Button></>}
    >
      <form id="project-form" className="dialog-form" onSubmit={handleSubmit}>
        {formError && <p className="field-error">{formError}</p>}
        <label>项目路径
          <span className="field-with-action">
            <input value={path} onChange={(event) => handlePathChange(event.target.value)} placeholder="E:\\Development\\NewProject" autoFocus />
            <IconButton type="button" title="选择项目目录" onClick={() => void chooseProjectPath()}><FolderOpen size={15} /></IconButton>
          </span>
        </label>
        <label>项目名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="默认使用路径最后一级目录名" /></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如 Tauri, 本地工具" /></label>
        <label>备注<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <section className="dialog-launch-configs">
          <div className="dialog-section-title">
            <h3>启动配置</h3>
            <Button type="button" onClick={addLaunchConfig}>添加启动项</Button>
          </div>
          {launchConfigs.map((config, index) => (
            <div className="launch-config-editor" key={config.id}>
              <label>名称<input value={config.name} onChange={(event) => updateLaunchConfig(config.id, { name: event.target.value })} placeholder={index === 0 ? "Frontend" : "Backend"} /></label>
              <label>工作目录
                <span className="field-with-action">
                  <input value={config.workdir} onChange={(event) => updateLaunchConfig(config.id, { workdir: event.target.value })} placeholder="默认使用项目路径" />
                  <IconButton type="button" title="选择工作目录" onClick={() => void chooseLaunchWorkdir(config.id)}><FolderOpen size={15} /></IconButton>
                </span>
              </label>
              <label className="full">启动命令<input value={config.command} onChange={(event) => updateLaunchConfig(config.id, { command: event.target.value })} placeholder="例如 pnpm dev" /></label>
              <div className="launch-config-actions">
                <label><input type="checkbox" checked={config.enabled} onChange={(event) => updateLaunchConfig(config.id, { enabled: event.target.checked })} />启用</label>
                <Button type="button" onClick={() => removeLaunchConfig(config.id)} disabled={launchConfigs.length === 1}>删除</Button>
              </div>
            </div>
          ))}
        </section>
      </form>
    </Modal>
  );
}

function getProjectNameFromPath(path: string) {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || "";
}

function createProjectId(name: string, path: string) {
  const base = (name || getProjectNameFromPath(path) || "project").toLowerCase();
  return `${base.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "")}-${Date.now().toString(36)}`;
}

function createLaunchConfig(name: string, workdir: string): ProjectLaunchConfig {
  const id = `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "") || "launch"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name,
    command: "",
    workdir,
    enabled: true
  };
}

function createProjectOpenProfileId(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `open-${slug || Date.now()}`;
}

function SkillsImportDialog({
  results,
  skillsRoot,
  onClose
}: {
  results: ImportResult[];
  skillsRoot: string;
  onClose: () => void;
}) {
  const importedCount = results.filter((result) => result.status === "imported").length;
  const conflictCount = results.filter((result) => result.status === "conflict").length;
  const invalidCount = results.filter((result) => result.status === "invalid").length;
  return (
    <Modal
      title="导入 Skills"
      description="从 ZIP 文件或已解压文件夹导入到统一根目录"
      onClose={onClose}
      large
      footer={
        <>
          <Button onClick={() => void workbenchApi.openLocalPath(skillsRoot)}><FolderOpen size={15} />打开统一根目录</Button>
          <Button variant="primary" onClick={onClose}>完成</Button>
        </>
      }
    >
      {results.length > 0 && (
        <>
          <div className="import-summary">
            <strong>导入完成</strong>
            <span>成功 {importedCount} 个 · 跳过 {conflictCount} 个 · 无效 {invalidCount} 个</span>
          </div>
          <div className="import-list">
            {results.map((result) => (
              <div className={`import-result ${result.status}`} key={result.directoryName}>
                <span><strong>{result.directoryName}</strong><small>{result.message}</small></span>
                <i>{importStatusLabel(result.status)}</i>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="warning">同名 Skill 会跳过；导入来源保持不变。已导入的 Skills 默认不会自动启用。</div>
    </Modal>
  );
}

function importStatusLabel(status: ImportResult["status"]) {
  if (status === "imported") return "已导入";
  if (status === "invalid") return "无效";
  return "已跳过";
}

function DeleteSkillDialog({
  skill,
  onClose,
  onConfirm
}: {
  skill: Skill;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除 Skill"
      description={`确认删除 ${skill.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除 Skill"
    >
      <p>将删除统一根目录中的 Skill，并清理 Workbench 管理的全局和项目启用记录。</p>
      <div className="file-block">
        <span>目录</span>
        <code>{skill.skillPath.replace(/[\\/][^\\/]+$/, "")}</code>
      </div>
      <div className="warning">不会删除未被 Workbench 管理的外部工具目录内容。</div>
    </ConfirmDeleteModal>
  );
}

function DeleteMarketSkillDialog({
  item,
  onClose,
  onConfirm
}: {
  item: SkillMarketItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const directoryName = item.installedDirectoryName || item.skillId;
  return (
    <ConfirmDeleteModal
      title="卸载市场 Skill"
      description={`确认卸载 ${item.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="卸载 Skill"
    >
      <p>将删除 Workbench 统一根目录中的源 Skill，并清理 Workbench 管理的全局和项目启用副本或符号链接。</p>
      <div className="file-block">
        <span>Skill</span>
        <code>{directoryName}</code>
      </div>
      <div className="file-block">
        <span>skills.sh 包</span>
        <code>{item.source}/{item.skillId}</code>
      </div>
      <div className="warning">不会删除未被 Workbench 管理的外部工具目录内容。</div>
    </ConfirmDeleteModal>
  );
}

function syncMethodLabel(method: "symlink" | "copy") {
  return method === "symlink" ? "Symlink" : "Copy";
}

function skillMatchesStatusFilter(skill: Skill, filter: string) {
  if (filter === "全部状态") return true;
  const hasGlobalManaged = skill.globalToolStates.some((state) => state.status === "managed");
  const hasConflict = skill.globalToolStates.some((state) => state.status === "conflict");
  const hasProjectEnablement = skill.enabledProjects.length > 0;
  const enabled = hasGlobalManaged || hasProjectEnablement;
  if (filter === "已启用") return enabled;
  if (filter === "内容冲突") return hasConflict;
  if (filter === "未启用") return !enabled && !hasConflict;
  return true;
}

function skillMatchesToolProjectFilter(
  skill: Skill,
  toolFilter: ToolKey | "全部工具",
  projectFilter: string
) {
  const hasToolFilter = toolFilter !== "全部工具";
  const hasProjectFilter = projectFilter !== "全部项目";
  if (!hasToolFilter && !hasProjectFilter) return true;
  const toolKey = hasToolFilter ? toolFilter : undefined;

  if (hasProjectFilter) {
    const projectEnablements = skill.enabledProjects.filter((entry) => entry.projectPath === projectFilter);
    if (!toolKey) return projectEnablements.length > 0;
    return projectEnablements.some((entry) => entry.tool === toolKey);
  }

  if (!toolKey) return true;
  return (
    skill.enabledTools.includes(toolKey) ||
    skill.globalToolStates.some((state) => state.tool === toolKey && state.status === "managed") ||
    skill.enabledProjects.some((entry) => entry.tool === toolKey)
  );
}

function globalStatusLabel(
  state: Skill["globalToolStates"][number] | undefined
) {
  if (!state || state.status === "disabled") return "未启用";
  if (state.status === "conflict") return "内容冲突";
  return `Workbench 管理 · ${syncMethodLabel(state.syncMethod ?? "copy")}`;
}

function RadarDialog({
  item,
  onSubmit,
  onClose
}: {
  item?: RadarItem;
  onSubmit: (item: RadarItem) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<RadarCategory>(item?.category ?? "项目");
  const [domain, setDomain] = useState(item?.domain ?? "未分类");
  const [url, setUrl] = useState(item?.url ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [formError, setFormError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      setFormError("条目名称不能为空");
      return;
    }
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setFormError("链接必须使用 http:// 或 https://");
      return;
    }
    onSubmit({
      id: item?.id ?? createRadarId(trimmedName),
      name: trimmedName,
      category,
      domain,
      url: trimmedUrl,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      note: note.trim(),
      favorite: item?.favorite ?? false,
      updatedAt: item?.updatedAt ?? new Date().toISOString().slice(0, 10),
      source: item?.source ?? "manual",
      sources: item?.sources ?? [item?.source ?? "manual"],
      externalId: item?.externalId ?? "",
      sourceDescription: item?.sourceDescription ?? "",
      sourceMetadata: item?.sourceMetadata ?? { language: "", topics: [], stars: 0, repositoryUpdatedAt: "" },
      sourceActive: item?.sourceActive ?? true,
      lastSyncedAt: item?.lastSyncedAt ?? ""
    });
  }

  return (
    <Modal
      title={item ? "编辑资源条目" : "添加资源条目"}
      description={item?.source === "github_star" ? "编辑用户维护的分类、标签、备注和收藏状态" : "手动记录本地资源条目"}
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button form="radar-form" type="submit" variant="primary">{item ? "保存" : "添加条目"}</Button></>}
    >
      <form id="radar-form" className="dialog-form" onSubmit={handleSubmit}>
        {formError && <p className="field-error">{formError}</p>}
        <label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="条目名称" autoFocus readOnly={item?.source === "github_star"} /></label>
        <label>分类<select value={category} onChange={(event) => setCategory(event.target.value as RadarCategory)}><option>项目</option><option>资讯</option><option>论文</option><option>其他</option></select></label>
        <label>领域<select value={domain} onChange={(event) => setDomain(event.target.value)}>{radarDomains.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label>链接<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" readOnly={item?.source === "github_star"} /></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="使用逗号分隔" /></label>
        <label>备注<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      </form>
    </Modal>
  );
}

function DeleteRadarDialog({
  item,
  onClose,
  onConfirm
}: {
  item: RadarItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title="删除资源条目"
      description={`确认删除 ${item.name}`}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="删除条目"
    >
      <p>删除后，该条目将从本地 Workbench 数据库中移除。</p>
      {item.url && <div className="file-block"><span>链接</span><code>{item.url}</code></div>}
    </ConfirmDeleteModal>
  );
}

function createRadarId(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "") || "radar";
  return `${base}-${Date.now().toString(36)}`;
}

function radarSourceLabel(item: RadarItem) {
  const sources = item.sources.length > 0 ? item.sources : [item.source];
  return sources.map((source) => source === "github_star" ? "GitHub Stars" : "手动添加").join(" + ");
}

function toastIcon(tone: ToastState["tone"]) {
  if (tone === "success") return <CircleCheck size={18} />;
  if (tone === "warning") return <CircleAlert size={18} />;
  if (tone === "danger") return <Ban size={18} />;
  return <CircleDot size={18} />;
}

function formatToastMessage(message: string) {
  const command = "gh auth login";
  if (!message.includes(command)) return message;
  const [before, after] = message.split(command);
  return (
    <>
      {before}
      <code>{command}</code>
      {after}
    </>
  );
}
