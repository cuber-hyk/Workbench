import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Ban,
  Box,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Moon,
  RefreshCcw,
  Settings,
  Sparkles,
  Star,
  Sun,
  X
} from "lucide-react";
import { AppUpdateDialog } from "./components/AppUpdatePanel";
import { UpdateBadge } from "./components/UpdateBadge";
import { Button, FilterMore, IconButton, Modal, PageHeader, Panel, TagList } from "./components/ui";
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
import { SettingsView } from "./views/settings/SettingsView";
import { ProjectsView } from "./views/projects/ProjectsView";
import { applyLaunchSessionEvent, applyPendingLaunchEvents, enabledLaunchConfigs, isAlreadyEndedLaunchMessage, isProjectRunning, markLaunchRunStopped, markLaunchRunStoppedInRuns, markLaunchSessionStoppedInRuns, mergeLaunchRunSnapshots, mergeLaunchRunSnapshotsInRuns, normalizeLaunchSessionEvent, replaceLaunchSessionInRuns } from "./views/projects/launchState";
import { DeleteRadarDialog, RadarDialog, RadarView } from "./views/radar/RadarView";
import { clearSkillMarketRuntimeCache, SkillsView } from "./views/skills/SkillsView";
import type { MarketInstallTask } from "./views/skills/SkillsMarketView";
import type { AppSettings, CloseBehavior, CustomToolTargetInput, ExternalSkillCandidateGroup, ExternalSkillSyncResult, ExternalSkillSyncSelection, ImportResult, LaunchRun, LaunchSession, LaunchSessionEvent, LaunchSessionSnapshot, ManagedTargetRebuildResult, ManagedTargetRebuildSelection, Project, ProjectOpenProfile, RadarDuplicateGroup, RadarItem, Skill, SkillCategory, SkillMarketItem, SkillsRootMigrationState, ToolKey, ViewKey } from "./lib/types/domain";

const views: Array<{ key: ViewKey; label: string; icon: JSX.Element }> = [
  { key: "projects", label: "项目", icon: <Box size={16} /> },
  { key: "skills", label: "Skills", icon: <Sparkles size={16} /> },
  { key: "radar", label: "资源 Radar", icon: <CircleDot size={16} /> },
  { key: "settings", label: "设置", icon: <Settings size={16} /> }
];

const updateNoticeStorageKey = "workbench-update-notice-version";

type ToastState = {
  message: string;
  tone: "neutral" | "success" | "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
};

type SkillImportRequest = {
  kind: "zip" | "folder";
  source: string;
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
  const [skillImportRequest, setSkillImportRequest] = useState<SkillImportRequest | null>(null);
  const [externalSkillCandidates, setExternalSkillCandidates] = useState<ExternalSkillCandidateGroup[]>([]);
  const [externalSyncResults, setExternalSyncResults] = useState<ExternalSkillSyncResult[]>([]);
  const [externalSyncLoading, setExternalSyncLoading] = useState(false);
  const [externalSyncApplying, setExternalSyncApplying] = useState(false);
  const externalSyncInFlightRef = useRef(false);
  const externalSyncApplyInFlightRef = useRef(false);
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

  async function runSkillImport(request: SkillImportRequest, overwriteDirectoryNames?: string[]) {
    const results =
      request.kind === "zip"
        ? await workbenchApi.importSkillsFromZip(request.source, overwriteDirectoryNames)
        : await workbenchApi.importSkillsFromFolder(request.source, overwriteDirectoryNames);
    setSkillImportRequest(request);
    setImportResults(results);
    setActiveDialog("skills-import");
    await refreshSkills();
  }

  async function openSkillsSyncDialog(options: { preserveCurrent?: boolean } = {}) {
    if (externalSyncInFlightRef.current) return;
    externalSyncInFlightRef.current = true;
    if (!options.preserveCurrent) {
      setExternalSkillCandidates([]);
      setExternalSyncResults([]);
    }
    setExternalSyncLoading(true);
    try {
      await refreshSkills();
      const candidates = await workbenchApi.discoverExternalSkills();
      const pendingCandidates = candidates.filter((candidate) =>
        candidate.status === "new" ||
        candidate.status === "conflict" ||
        candidate.status === "invalid" ||
        candidate.status === "unreadable"
      );
      const sameCount = candidates.filter((candidate) => candidate.status === "same_as_current").length;
      if (pendingCandidates.length === 0) {
        setActiveDialog(null);
        setExternalSkillCandidates([]);
        setExternalSyncResults([]);
        if (candidates.length === 0) {
          showToast("Skills 已同步，未发现外部工具 Skills");
        } else {
          showToast(`Skills 已同步，无待处理项；${sameCount} 项已存在相同内容`);
        }
        return;
      }
      setExternalSkillCandidates(candidates);
      setExternalSyncResults([]);
      setActiveDialog("external-skills");
    } catch (error) {
      showToast(String(error));
    } finally {
      setExternalSyncLoading(false);
      externalSyncInFlightRef.current = false;
    }
  }

  async function syncExternalSkillSelections(selections: ExternalSkillSyncSelection[]) {
    if (externalSyncApplyInFlightRef.current) return;
    externalSyncApplyInFlightRef.current = true;
    setExternalSyncApplying(true);
    try {
      const results = await workbenchApi.syncExternalSkills(selections);
      await refreshSkills();
      const blockingResults = results.filter((result) =>
        result.status === "conflict" ||
        result.status === "invalid" ||
        result.status === "failed"
      );
      if (blockingResults.length > 0) {
        setExternalSyncResults(blockingResults);
        showToast(`Skills 同步完成，${blockingResults.length} 项需要处理`);
        return;
      }
      setActiveDialog(null);
      setExternalSkillCandidates([]);
      setExternalSyncResults([]);
      const syncedCount = results.filter((result) => result.status === "synced").length;
      const skippedCount = results.filter((result) => result.status === "skipped").length;
      showToast(skippedCount > 0
        ? `Skills 已同步：接管 ${syncedCount} 项，跳过 ${skippedCount} 项`
        : `Skills 已同步：接管 ${syncedCount} 项`);
    } catch (error) {
      showToast(String(error));
    } finally {
      setExternalSyncApplying(false);
      externalSyncApplyInFlightRef.current = false;
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
      setSkillImportRequest(null);
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
      clearSkillMarketRuntimeCache();
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
                await runSkillImport({ kind, source });
              } catch (error) {
                showToast(String(error));
              }
            }}
            onSyncSkills={() => void openSkillsSyncDialog()}
            isSyncingSkills={externalSyncLoading}
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
            action={<Button disabled={externalSyncLoading} onClick={() => void openSkillsSyncDialog()}><Sparkles className={externalSyncLoading ? "spin" : ""} size={15} />{externalSyncLoading ? "同步中" : "同步 Skills"}</Button>}
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
          canResolveConflicts={Boolean(skillImportRequest)}
          onOverwriteConflicts={async (directoryNames) => {
            if (!skillImportRequest) return;
            try {
              await runSkillImport(skillImportRequest, directoryNames);
              showToast("冲突 Skill 已覆盖");
            } catch (error) {
              showToast(String(error));
            }
          }}
          onClose={() => {
            setActiveDialog(null);
            setImportResults([]);
            setSkillImportRequest(null);
          }}
        />
      )}
      {activeDialog === "external-skills" && settings && (
        <ExternalSkillsDialog
          candidates={externalSkillCandidates}
          results={externalSyncResults}
          loading={externalSyncLoading}
          syncing={externalSyncApplying}
          skillsRoot={settings.skillsRoot}
          onRefresh={() => void openSkillsSyncDialog({ preserveCurrent: true })}
          onSync={(selections) => void syncExternalSkillSelections(selections)}
          onClose={() => {
            if (externalSyncApplying) return;
            setActiveDialog(null);
            setExternalSkillCandidates([]);
            setExternalSyncResults([]);
            setExternalSyncLoading(false);
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
