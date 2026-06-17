import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Box,
  ChevronDown,
  CircleDot,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FolderOpen,
  MonitorUp,
  Moon,
  Pause,
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
import { AppUpdateDialog, AppUpdatePanel } from "./components/AppUpdatePanel";
import { UpdateBadge } from "./components/UpdateBadge";
import { ActionGroup, Button, ConfirmDeleteModal, DetailHeader, FilterMore, IconButton, Modal, PageHeader, Panel, SearchInput, StatusBadge, TagList, Toolbar } from "./components/ui";
import { useAppUpdate } from "./contexts/AppUpdateContext";
import { workbenchApi } from "./lib/api/workbenchApi";
import type { AppSettings, ImportResult, LaunchRun, LaunchSession, LaunchSessionEvent, LaunchSessionSnapshot, Project, ProjectLaunchConfig, ProjectOpenProfile, RadarCategory, RadarDuplicateGroup, RadarItem, Skill, SkillVersionSource, ToolTarget, ViewKey } from "./lib/types/domain";

const views: Array<{ key: ViewKey; label: string; icon: JSX.Element }> = [
  { key: "projects", label: "项目", icon: <Box size={16} /> },
  { key: "skills", label: "Skills", icon: <Sparkles size={16} /> },
  { key: "radar", label: "资源 Radar", icon: <CircleDot size={16} /> },
  { key: "settings", label: "设置", icon: <Settings size={16} /> }
];

const radarDomains = ["未分类", "Skills", "Agent", "RAG", "AI 基础", "开发工具", "文档工具", "算法与数据结构", "教程与资源", "前端开发", "Android 开发", "桌面应用", "音视频工具", "安全与网络", "其他"];
const updateNoticeStorageKey = "workbench-update-notice-version";

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function App() {
  const { hasUpdate, updateInfo } = useAppUpdate();
  const [activeView, setActiveView] = useState<ViewKey>("projects");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("workbench-theme") as "light" | "dark") || "light";
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
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
  const [activeDialog, setActiveDialog] = useState<"project" | "project-open-profile" | "project-open-profile-delete" | "skills-import" | "skill-delete" | "radar" | "radar-delete" | "app-update" | null>(null);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editingProjectOpenProfileId, setEditingProjectOpenProfileId] = useState("");
  const [deleteProjectOpenProfileId, setDeleteProjectOpenProfileId] = useState("");
  const [editingRadarId, setEditingRadarId] = useState("");
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [deleteSkillId, setDeleteSkillId] = useState("");
  const [syncingGithubStars, setSyncingGithubStars] = useState(false);

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
    setLoading(true);
    void Promise.all([
      workbenchApi.listProjects().then(setProjects),
      workbenchApi.listSkills().then(setSkills),
      workbenchApi.listRadarItems().then(setRadarItems),
      workbenchApi.listRadarDuplicateGroups().then(setRadarDuplicateGroups),
      workbenchApi.getSettings().then(setSettings)
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
  const editingProjectOpenProfile = settings?.projectOpenProfiles.find((profile) => profile.id === editingProjectOpenProfileId);
  const deletingProjectOpenProfile = settings?.projectOpenProfiles.find((profile) => profile.id === deleteProjectOpenProfileId);
  const selectedRadar = radarItems.find((item) => item.id === selectedRadarId) ?? radarItems[0];

  function showToast(message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number }) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, actionLabel: options?.actionLabel, onAction: options?.onAction });
    toastTimerRef.current = window.setTimeout(() => setToast(null), options?.duration ?? 1800);
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
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
    currentToast.onAction?.();
  }

  async function refreshSkills() {
    const state = await workbenchApi.getSkillsState();
    setSkills(state.skills);
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
      const result = await workbenchApi.syncGithubStars();
      setRadarItems(result.items);
      setRadarDuplicateGroups(await workbenchApi.listRadarDuplicateGroups());
      showToast(`GitHub Stars 同步完成：新增 ${result.added}，更新 ${result.updated}，失效 ${result.deactivated}，未变化 ${result.unchanged}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
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
            onCategory={(category) =>
              void runSkillAction(
                () => workbenchApi.setSkillCategory(selectedSkill.directoryName, category),
                "分类已更新"
              )
            }
            onCategorySkill={(directoryName, category) =>
              void runSkillAction(
                () => workbenchApi.setSkillCategory(directoryName, category),
                "分类已更新"
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
            onOpenPath={(path) => void workbenchApi.openLocalPath(path).catch((error) => showToast(String(error)))}
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
        <div className={`toast show ${toast.onAction ? "actionable" : ""}`}>
          <span>{toast.message}</span>
          {toast.onAction && (
            <button type="button" onClick={() => runToastAction(toast)}>
              {toast.actionLabel ?? "查看"}
            </button>
          )}
        </div>
      )}
      {activeDialog === "app-update" && <AppUpdateDialog onClose={() => setActiveDialog(null)} />}
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

function SkillsView({
  skills,
  selectedSkill,
  settings,
  projects,
  onSelect,
  onImport,
  onRefresh,
  onToggle,
  onToggleSkillGlobal,
  onToggleProjectAll,
  onCategory,
  onCategorySkill,
  onResolve,
  onDeleteSkill
}: {
  skills: Skill[];
  selectedSkill: Skill;
  settings: AppSettings;
  projects: Project[];
  onSelect: (id: string) => void;
  onImport: (kind: "zip" | "folder") => Promise<void>;
  onRefresh: () => void;
  onToggle: (tool: ToolTarget["key"], enabled: boolean, project?: Project) => void;
  onToggleSkillGlobal: (directoryName: string, tool: ToolTarget["key"], enabled: boolean) => void;
  onToggleProjectAll: (project: Project, enabled: boolean) => void;
  onCategory: (category: string) => void;
  onCategorySkill: (directoryName: string, category: string) => void;
  onResolve: (source: SkillVersionSource) => void;
  onDeleteSkill: (skillId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部分类");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const categories = ["全部分类", ...Array.from(new Set(skills.map((skill) => skill.category))).sort()];
  const visibleSkills = skills.filter((skill) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery);
    const matchesCategory = categoryFilter === "全部分类" || skill.category === categoryFilter;
    const matchesStatus = skillMatchesStatusFilter(skill, statusFilter);
    return matchesQuery && matchesCategory && matchesStatus;
  });

  return (
    <section className="view">
      <PageHeader
        title="Skills"
        description={`统一根目录 · ${skills.length} 个 Skills`}
        actions={
          <div className="header-actions">
            <Button onClick={onRefresh}><RefreshCcw size={15} />扫描</Button>
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
        }
      />
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
      </Toolbar>
      <div className="split-layout skills-layout">
        <Panel className="list-panel">
          <div className="table-head skills-grid"><span>Skill</span><span>分类</span><span>全局启用</span><span>项目启用</span><span>操作</span></div>
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
              <InlineCategory
                category={skill.category}
                onSave={(category) => onCategorySkill(skill.directoryName, category)}
              />
              <GlobalToolIcons
                skill={skill}
                tools={settings.toolTargets}
                onToggle={(tool, enabled) => onToggleSkillGlobal(skill.directoryName, tool, enabled)}
              />
              <span>{skill.enabledProjects.length ? `${skill.enabledProjects.length} 个项目` : "未启用"}</span>
              <ActionGroup className="row-actions">
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
          <DetailHeader title={selectedSkill.name} description={`分类：${selectedSkill.category}`} />
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
                    checked={settings.toolTargets.every((tool) =>
                      selectedSkill.enabledProjects.some(
                        (entry) => entry.projectPath === project.path && entry.tool === tool.key
                      )
                    )}
                    onChange={(enabled) => onToggleProjectAll(project, enabled)}
                    title={`${project.name} 全部工具启用`}
                  />
                </div>
                <div className="project-tool-toggles">
                  {settings.toolTargets.map((tool) => {
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
          <label className="category-field">
            <span>分类</span>
            <input
              key={`${selectedSkill.id}-${selectedSkill.category}`}
              defaultValue={selectedSkill.category}
              onBlur={(event) => {
                const category = event.target.value.trim() || "未分类";
                if (category !== selectedSkill.category) onCategory(category);
              }}
              placeholder="例如：文档"
            />
          </label>
        </Panel>
      </div>
    </section>
  );
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
  onToggle: (tool: ToolTarget["key"], enabled: boolean) => void;
}) {
  return (
    <span className="tool-icons">
      {tools.map((tool) => {
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
            <ToolIcon tool={tool.key} />
          </button>
        );
      })}
    </span>
  );
}

function InlineCategory({
  category,
  onSave
}: {
  category: string;
  onSave: (category: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category);

  useEffect(() => {
    setValue(category);
  }, [category]);

  function save() {
    const next = value.trim() || "未分类";
    setEditing(false);
    if (next !== category) onSave(next);
  }

  if (editing) {
    return (
      <input
        className="inline-category-input"
        autoFocus
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setValue(category);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      className="inline-category-tag"
      title="双击编辑分类"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {category}
    </button>
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
  onOpenPath: (path: string) => void;
  onAddProjectOpenProfile: () => void;
  onEditProjectOpenProfile: (profile: ProjectOpenProfile) => void;
  onDeleteProjectOpenProfile: (profile: ProjectOpenProfile) => void;
}) {
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
          <h2>支持的工具目录</h2>
          <p>Workbench 通过符号链接为以下工具启用 Skills。</p>
          {settings.toolTargets.map((tool) => (
            <div className="settings-row" key={tool.key}>
              <span><strong>{tool.name}</strong><small>{tool.globalSkillsDir}</small></span>
              <span className="settings-row-actions">
                <IconButton title={`打开 ${tool.name} Skills 目录`} onClick={() => onOpenPath(tool.globalSkillsDir)}><FolderOpen size={15} /></IconButton>
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
        <label className="full">参数<textarea rows={3} value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder="每行一个参数，例如 {projectPath}" /></label>
        <label>工作目录<input value={workdir} onChange={(event) => setWorkdir(event.target.value)} placeholder="{projectPath}" /></label>
        <label className="checkbox-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />启用此打开方式</label>
        <div className="notice full">支持占位符 <code>{"{projectPath}"}</code>。Claude Code 等交互式 CLI 会在外部终端中打开，不进入项目启动日志。</div>
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

function ToolIcon({ tool }: { tool: ToolTarget["key"] }) {
  if (tool === "claude") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
      </svg>
    );
  }
  if (tool === "opencode") {
    return (
      <svg viewBox="0 0 240 300" aria-hidden="true">
        <path d="M180 240H60V120H180V240Z" />
        <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954l4.572-2.604a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763l4.571 2.608c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41v5.212a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773l-4.572-2.608a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954l-4.571 2.603a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z" />
    </svg>
  );
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
