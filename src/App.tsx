import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
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
  Moon,
  PackagePlus,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  Star,
  Sun,
  Trash2,
  X
} from "lucide-react";
import { AppUpdateDialog } from "./components/AppUpdatePanel";
import { UpdateBadge } from "./components/UpdateBadge";
import { ActionGroup, Button, DetailHeader, FilterMore, IconButton, Modal, PageHeader, Panel, SearchInput, StatusBadge, TagList, Toolbar } from "./components/ui";
import { ProjectDialog } from "./components/dialogs/projects/ProjectDialog";
import { CreateDirectoryDialog } from "./components/dialogs/settings/CreateDirectoryDialog";
import { CustomToolDialog } from "./components/dialogs/settings/CustomToolDialog";
import { DeleteCustomToolDialog } from "./components/dialogs/settings/DeleteCustomToolDialog";
import { DeleteProjectOpenProfileDialog } from "./components/dialogs/settings/DeleteProjectOpenProfileDialog";
import { ProjectOpenProfileDialog } from "./components/dialogs/settings/ProjectOpenProfileDialog";
import { TrayHintDialog } from "./components/dialogs/settings/TrayHintDialog";
import { DeleteMarketSkillDialog } from "./components/dialogs/skills/DeleteMarketSkillDialog";
import { DeleteSkillDialog } from "./components/dialogs/skills/DeleteSkillDialog";
import { ExternalSkillsDialog } from "./components/dialogs/skills/ExternalSkillsDialog";
import { SkillCategoryDialog } from "./components/dialogs/skills/SkillCategoryDialog";
import { SkillsImportDialog } from "./components/dialogs/skills/SkillsImportDialog";
import { SkillsRootMigrationDialog } from "./components/dialogs/skills/SkillsRootMigrationDialog";
import { useAppUpdate } from "./contexts/AppUpdateContext";
import { workbenchApi } from "./lib/api/workbenchApi";
import { ToolIcon } from "./lib/ui/toolIcons";
import { SettingsView } from "./views/settings/SettingsView";
import { ProjectsView } from "./views/projects/ProjectsView";
import { applyLaunchSessionEvent, applyPendingLaunchEvents, enabledLaunchConfigs, isAlreadyEndedLaunchMessage, isProjectRunning, markLaunchRunStopped, markLaunchRunStoppedInRuns, markLaunchSessionStoppedInRuns, mergeLaunchRunSnapshots, mergeLaunchRunSnapshotsInRuns, normalizeLaunchSessionEvent, replaceLaunchSessionInRuns } from "./views/projects/launchState";
import { DeleteRadarDialog, RadarDialog, RadarView } from "./views/radar/RadarView";
import type { AppSettings, CloseBehavior, CustomToolTargetInput, ExternalSkillCandidateGroup, ExternalSkillImportSelection, ImportResult, LaunchRun, LaunchSession, LaunchSessionEvent, LaunchSessionSnapshot, ManagedTargetRebuildResult, ManagedTargetRebuildSelection, Project, ProjectOpenProfile, RadarDuplicateGroup, RadarItem, Skill, SkillCategory, SkillMarketDetail, SkillMarketItem, SkillUpdateResult, SkillUpdateState, SkillUpdateStatus, SkillVersionSource, SkillsRootMigrationState, ToolKey, ToolTarget, ViewKey } from "./lib/types/domain";

export { RadarView } from "./views/radar/RadarView";
export { ProjectsView } from "./views/projects/ProjectsView";
export { SettingsView } from "./views/settings/SettingsView";
export { ProjectDialog } from "./components/dialogs/projects/ProjectDialog";
export { CustomToolDialog } from "./components/dialogs/settings/CustomToolDialog";
export { SkillCategoryDialog } from "./components/dialogs/skills/SkillCategoryDialog";
export { applyPendingLaunchEvents, markLaunchRunStopped, mergeLaunchRunSnapshots } from "./views/projects/launchState";

const views: Array<{ key: ViewKey; label: string; icon: JSX.Element }> = [
  { key: "projects", label: "项目", icon: <Box size={16} /> },
  { key: "skills", label: "Skills", icon: <Sparkles size={16} /> },
  { key: "radar", label: "资源 Radar", icon: <CircleDot size={16} /> },
  { key: "settings", label: "设置", icon: <Settings size={16} /> }
];

const updateNoticeStorageKey = "workbench-update-notice-version";
let skillMarketRuntimeCache: { items: SkillMarketItem[]; updatedAt: number } | null = null;

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
  const [activeDialog, setActiveDialog] = useState<"project" | "project-open-profile" | "project-open-profile-delete" | "custom-tool" | "custom-tool-delete" | "skills-import" | "external-skills" | "skills-root-migration" | "skills-root-change" | "skill-delete" | "skill-categories" | "radar" | "radar-delete" | "app-update" | "create-directory" | "tray-hint" | null>(null);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editingProjectOpenProfileId, setEditingProjectOpenProfileId] = useState("");
  const [deleteProjectOpenProfileId, setDeleteProjectOpenProfileId] = useState("");
  const [editingCustomToolKey, setEditingCustomToolKey] = useState("");
  const [deleteCustomToolKey, setDeleteCustomToolKey] = useState("");
  const [editingRadarId, setEditingRadarId] = useState("");
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [externalSkillCandidates, setExternalSkillCandidates] = useState<ExternalSkillCandidateGroup[]>([]);
  const [migrationState, setMigrationState] = useState<SkillsRootMigrationState | null>(null);
  const [rebuildResults, setRebuildResults] = useState<ManagedTargetRebuildResult[]>([]);
  const [pendingSkillsRoot, setPendingSkillsRoot] = useState("");
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

  async function openExternalSkillsDialog() {
    try {
      const candidates = await workbenchApi.discoverExternalSkills();
      setExternalSkillCandidates(candidates);
      setActiveDialog("external-skills");
    } catch (error) {
      showToast(String(error));
    }
  }

  async function importExternalSkillSelections(selections: ExternalSkillImportSelection[]) {
    try {
      const results = await workbenchApi.importExternalSkills(selections);
      setImportResults(results);
      await refreshSkills();
      setActiveDialog("skills-import");
      showToast("外部 Skills 导入完成");
    } catch (error) {
      showToast(String(error));
    }
  }

  async function openSkillsRootMigrationDialog() {
    try {
      const state = await workbenchApi.inspectSkillsRootMigration();
      setMigrationState(state);
      setRebuildResults([]);
      setActiveDialog("skills-root-migration");
    } catch (error) {
      showToast(String(error));
    }
  }

  function requestSkillsRootChange(path: string) {
    setPendingSkillsRoot(path);
    setActiveDialog("skills-root-change");
  }

  async function confirmSkillsRootChange() {
    if (!pendingSkillsRoot) return;
    await runSkillAction(() => workbenchApi.setSkillsRoot(pendingSkillsRoot), "Skills 根目录已切换");
    setPendingSkillsRoot("");
    setActiveDialog(null);
    void openSkillsRootMigrationDialog();
  }

  async function migrateRootSkills(directoryNames: string[]) {
    try {
      const results = await workbenchApi.migrateSkillsRoot(directoryNames.map((directoryName) => ({ directoryName })));
      setImportResults(results);
      await refreshSkills();
      setMigrationState(await workbenchApi.inspectSkillsRootMigration());
      setActiveDialog("skills-import");
      showToast("根目录迁移完成");
    } catch (error) {
      showToast(String(error));
    }
  }

  async function rebuildManagedTargets(selections: ManagedTargetRebuildSelection[]) {
    try {
      const results = await workbenchApi.rebuildManagedSkillTargets(selections);
      setRebuildResults(results);
      await refreshSkills();
      setMigrationState(await workbenchApi.inspectSkillsRootMigration());
      showToast("受管目标重建完成");
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
            onDiscoverExternalSkills={() => void openExternalSkillsDialog()}
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
            action={<Button onClick={() => void openExternalSkillsDialog()}><Sparkles size={15} />发现已有工具 Skills</Button>}
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
            onRootChange={requestSkillsRootChange}
            onInspectRootMigration={() => void openSkillsRootMigrationDialog()}
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
      {activeDialog === "external-skills" && settings && (
        <ExternalSkillsDialog
          candidates={externalSkillCandidates}
          skillsRoot={settings.skillsRoot}
          onRefresh={() => void openExternalSkillsDialog()}
          onImport={(selections) => void importExternalSkillSelections(selections)}
          onClose={() => {
            setActiveDialog(null);
            setExternalSkillCandidates([]);
          }}
        />
      )}
      {activeDialog === "skills-root-change" && settings && (
        <Modal
          title="切换 Skills 根目录"
          description="切换只改变 Workbench 的统一来源，不会自动迁移旧目录内容或重建工具目录链接。"
          onClose={() => {
            setActiveDialog(null);
            setPendingSkillsRoot("");
          }}
          footer={
            <>
              <Button onClick={() => {
                setActiveDialog(null);
                setPendingSkillsRoot("");
              }}>取消</Button>
              <Button variant="primary" onClick={() => void confirmSkillsRootChange()}>切换根目录</Button>
            </>
          }
        >
          <div className="file-block"><span>当前根目录</span><code>{settings.skillsRoot}</code></div>
          <div className="file-block"><span>新根目录</span><code>{pendingSkillsRoot}</code></div>
          <div className="warning">切换后可在设置页检查旧根目录迁移，并按需重建 Workbench 受管的启用目标。</div>
        </Modal>
      )}
      {activeDialog === "skills-root-migration" && migrationState && (
        <SkillsRootMigrationDialog
          state={migrationState}
          rebuildResults={rebuildResults}
          onMigrate={(directoryNames) => void migrateRootSkills(directoryNames)}
          onRebuild={(selections) => void rebuildManagedTargets(selections)}
          onRefresh={() => void openSkillsRootMigrationDialog()}
          onClose={() => {
            setActiveDialog(null);
            setMigrationState(null);
            setRebuildResults([]);
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
  emptyDescription,
  action
}: {
  title: string;
  description: string;
  loading: boolean;
  error: string;
  emptyTitle: string;
  emptyDescription: string;
  action?: ReactNode;
}) {
  return (
    <section className="view">
      <PageHeader title={title} description={description} />
      <Panel className="state-panel">
        <div className="empty-state detail-empty">
          <strong>{loading ? "正在加载" : error ? "加载失败" : emptyTitle}</strong>
          <small>{loading ? "正在读取 Workbench 本地数据。" : error || emptyDescription}</small>
          {!loading && !error && action}
        </div>
      </Panel>
    </section>
  );
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
  onDiscoverExternalSkills = () => undefined,
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
  onDiscoverExternalSkills?: () => void;
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
            <Button onClick={onDiscoverExternalSkills}><Sparkles size={15} />发现已有工具 Skills</Button>
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
