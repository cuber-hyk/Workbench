import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { projects, radarItems, settings, skillCategories, skills } from "./mockData";
import type { CloseBehavior, CustomToolTargetInput, GitHubCliStatus, GitHubStarsSyncResult, ImportResult, LaunchRun, LaunchSession, LaunchSessionEvent, LaunchSessionSnapshot, Project, ProjectOpenProfile, RadarDuplicateGroup, RadarItem, SkillInstallProgress, SkillMarketDetail, SkillMarketItem, SkillUpdateResult, SkillUpdateStatus, SkillVersionSource, SkillsState, ToolKey } from "../types/domain";

const delay = async () => new Promise((resolve) => window.setTimeout(resolve, 80));
const isTauri = "__TAURI_INTERNALS__" in window;

async function skillsState(): Promise<SkillsState> {
  if (isTauri) {
    const state = await invoke<SkillsState>("get_skills_state");
    const projectOpenProfiles = await invoke<ProjectOpenProfile[]>("list_project_open_profiles");
    return { ...state, settings: { ...state.settings, projectOpenProfiles } };
  }
  await delay();
  return { settings, skills, categories: previewSkillCategories() };
}

function previewSkillCategories() {
  return skillCategories
    .map((category) => ({
      ...category,
      skillCount: skills.filter((skill) => skill.categoryId === category.id).length
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

const previewMarketItems: SkillMarketItem[] = [
  {
    source: "vercel-labs/next-skills",
    skillId: "next-upgrade",
    name: "next-upgrade",
    description: "Upgrade Next.js following official migration guides.",
    installs: 24209,
    official: true,
    installedDirectoryName: null,
    updateStatus: "not_installed",
    installable: true
  },
  {
    source: "github/awesome-copilot",
    skillId: "excalidraw-diagram-generator",
    name: "excalidraw-diagram-generator",
    description: "Generate Excalidraw diagrams from natural language descriptions.",
    installs: 24385,
    official: true,
    installedDirectoryName: "excalidraw-diagram-generator",
    updateStatus: "update_available",
    installable: true
  },
  {
    source: "skills.volces.com",
    skillId: "byted-web-search",
    name: "byted-web-search",
    description: "Non-GitHub source shown as unavailable for Workbench-managed install.",
    installs: 25028,
    official: false,
    installedDirectoryName: null,
    updateStatus: "unsupported",
    installable: false
  }
];

const previewUpdateStatuses: SkillUpdateStatus[] = [
  {
    name: "excalidraw-diagram-generator",
    description: "Generate Excalidraw diagrams from natural language descriptions.",
    status: "update_available",
    message: "发现可更新版本",
    source: {
      directoryName: "excalidraw-diagram-generator",
      source: "skills_sh",
      packageSlug: "github/awesome-copilot/excalidraw-diagram-generator",
      repoUrl: "https://github.com/github/awesome-copilot",
      skillPath: "skills/excalidraw-diagram-generator",
      installedRef: "local-a84c2b7",
      installedHash: "local-a84c2b7",
      remoteRef: "remote-f03a112",
      lastCheckedAt: "刚刚",
      installedAt: "2026-06-18",
      updatedAt: "2026-06-18"
    }
  }
];

export const workbenchApi = {
  async health() {
    try {
      return await invoke<string>("app_health");
    } catch {
      return "web-preview";
    }
  },
  async listProjects() {
    if (isTauri) {
      return invoke<Project[]>("list_projects");
    }
    await delay();
    return projects;
  },
  async saveProject(project: Project) {
    if (!isTauri) {
      await delay();
      const index = projects.findIndex((item) => item.id === project.id);
      if (index >= 0) {
        projects[index] = project;
      } else {
        projects.push(project);
      }
      return projects;
    }
    return invoke<Project[]>("save_project", { project });
  },
  async launchProject(project: Project) {
    if (!isTauri) {
      await delay();
      return createPreviewLaunchRun(project);
    }
    return invoke<LaunchRun>("launch_project", {
      projectId: project.id,
      name: project.name,
      launchConfigs: project.launchConfigs
    });
  },
  async stopLaunchSession(sessionId: string) {
    if (!isTauri) {
      await delay();
      return;
    }
    return invoke<void>("stop_launch_session", { sessionId });
  },
  async stopLaunchRun(launchRunId: string) {
    if (!isTauri) {
      await delay();
      return;
    }
    return invoke<void>("stop_launch_run", { launchRunId });
  },
  async restartLaunchSession(session: LaunchSession) {
    if (!isTauri) {
      await delay();
      return {
        ...session,
        status: "running" as const,
        exitCode: undefined,
        output: [{ stream: "stdout" as const, content: `预览重新启动中：${session.command}\n` }]
      };
    }
    return invoke<LaunchSession>("restart_launch_session", { session });
  },
  async getLaunchRunSnapshot(launchRunId: string) {
    if (!isTauri) {
      await delay();
      return [] as LaunchSessionSnapshot[];
    }
    return invoke<LaunchSessionSnapshot[]>("get_launch_run_snapshot", { launchRunId });
  },
  async subscribeLaunchEvents(handler: (event: LaunchSessionEvent) => void) {
    if (!isTauri) return () => {};
    return listen<LaunchSessionEvent>("launch-session-event", (event) => handler(event.payload));
  },
  async listSkills() {
    return (await skillsState()).skills;
  },
  async listSkillCategories() {
    return (await skillsState()).categories;
  },
  async listRadarItems() {
    if (isTauri) {
      return invoke<RadarItem[]>("list_radar_items");
    }
    await delay();
    return radarItems;
  },
  async listRadarDuplicateGroups() {
    if (isTauri) {
      return invoke<RadarDuplicateGroup[]>("list_radar_duplicate_groups");
    }
    await delay();
    return [] as RadarDuplicateGroup[];
  },
  async mergeRadarDuplicateGroup(groupId: string, primaryItemId: string) {
    if (!isTauri) {
      await delay();
      return radarItems;
    }
    return invoke<RadarItem[]>("merge_radar_duplicate_group", { groupId, primaryItemId });
  },
  async saveRadarItem(item: RadarItem) {
    if (!isTauri) {
      await delay();
      const index = radarItems.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) {
        radarItems[index] = item;
      } else {
        radarItems.push(item);
      }
      return radarItems;
    }
    return invoke<RadarItem[]>("save_radar_item", { item });
  },
  async deleteRadarItem(id: string) {
    if (!isTauri) {
      await delay();
      const index = radarItems.findIndex((candidate) => candidate.id === id);
      if (index >= 0) radarItems.splice(index, 1);
      return radarItems;
    }
    return invoke<RadarItem[]>("delete_radar_item", { id });
  },
  async openRadarLink(url: string) {
    if (!isTauri) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    return invoke<void>("open_radar_link", { url });
  },
  async checkGithubCliStatus() {
    if (!isTauri) {
      await delay();
      return {
        status: "missing",
        account: "",
        message: "未检测到 gh 命令。请先安装 GitHub CLI，并运行 gh auth login 登录后重试。"
      } satisfies GitHubCliStatus;
    }
    return invoke<GitHubCliStatus>("check_github_cli_status");
  },
  async syncGithubStars() {
    if (!isTauri) {
      await delay();
      return {
        items: radarItems,
        added: 0,
        updated: 0,
        deactivated: 0,
        unchanged: radarItems.filter((item) => item.source === "github_star").length
      } satisfies GitHubStarsSyncResult;
    }
    return invoke<GitHubStarsSyncResult>("sync_github_stars");
  },
  async getSettings() {
    return (await skillsState()).settings;
  },
  async listProjectOpenProfiles() {
    if (isTauri) {
      return invoke<ProjectOpenProfile[]>("list_project_open_profiles");
    }
    await delay();
    return settings.projectOpenProfiles;
  },
  async saveProjectOpenProfile(profile: ProjectOpenProfile) {
    if (!isTauri) {
      await delay();
      const index = settings.projectOpenProfiles.findIndex((item) => item.id === profile.id);
      if (index >= 0) {
        settings.projectOpenProfiles[index] = profile;
      } else {
        settings.projectOpenProfiles.push(profile);
      }
      settings.projectOpenProfiles.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
      return settings.projectOpenProfiles;
    }
    return invoke<ProjectOpenProfile[]>("save_project_open_profile", { profile });
  },
  async deleteProjectOpenProfile(id: string) {
    if (!isTauri) {
      await delay();
      const index = settings.projectOpenProfiles.findIndex((item) => item.id === id);
      if (index >= 0) settings.projectOpenProfiles.splice(index, 1);
      return settings.projectOpenProfiles;
    }
    return invoke<ProjectOpenProfile[]>("delete_project_open_profile", { id });
  },
  async selectProjectOpenExecutable() {
    if (!isTauri) {
      await delay();
      throw new Error("程序选择器仅在 Tauri 桌面应用中可用");
    }
    return invoke<string | null>("select_project_open_executable");
  },
  async openProjectWithProfile(project: Project, profile: ProjectOpenProfile) {
    if (!isTauri) {
      await delay();
      return;
    }
    return invoke<void>("open_project_with_profile", { projectPath: project.path, profile });
  },
  async getSkillsState() {
    return skillsState();
  },
  async listSkillMarket(query?: string) {
    if (!isTauri) {
      await delay();
      const normalized = (query ?? "").trim().toLowerCase();
      return previewMarketItems.filter((item) =>
        !normalized ||
        item.name.toLowerCase().includes(normalized) ||
        item.skillId.toLowerCase().includes(normalized) ||
        item.source.toLowerCase().includes(normalized)
      );
    }
    return invoke<SkillMarketItem[]>("list_skill_market", { query: query || null });
  },
  async getSkillMarketDetail(source: string, skillId: string) {
    if (!isTauri) {
      await delay();
      const item = previewMarketItems.find((candidate) => candidate.source === source && candidate.skillId === skillId) ?? previewMarketItems[0];
      return {
        item,
        repositoryUrl: item.source.includes("/") && !item.source.includes(".") ? `https://github.com/${item.source}` : "",
        installCommand: `npx -y skills add ${item.source} --skill ${item.skillId} -g --agent codex -y --copy`,
        skillMarkdownPreview: item.description,
        securityNote: "预览数据：Workbench 通过 skills.sh 官方 CLI 安装，并在写入前做结构校验。"
      } satisfies SkillMarketDetail;
    }
    return invoke<SkillMarketDetail>("get_skill_market_detail", { source, skillId });
  },
  async installSkillFromMarket(source: string, skillId: string, onProgress?: (progress: number) => void) {
    if (!isTauri) {
      for (const progress of [8, 28, 55, 72, 84, 92, 97, 100]) {
        onProgress?.(progress);
        await delay();
      }
      const item = previewMarketItems.find((candidate) => candidate.source === source && candidate.skillId === skillId);
      if (item) {
        item.installedDirectoryName = skillId;
        item.updateStatus = "installed";
      }
      return skillsState();
    }
    const unlisten = await listen<SkillInstallProgress>("skill-install-progress", (event) => {
      if (event.payload.source === source && event.payload.skillId === skillId) {
        onProgress?.(event.payload.progress);
      }
    });
    try {
      return await invoke<SkillsState>("install_skill_from_market", { source, skillId });
    } finally {
      unlisten();
    }
  },
  async listSkillUpdates() {
    if (!isTauri) {
      await delay();
      return previewUpdateStatuses;
    }
    return invoke<SkillUpdateStatus[]>("list_skill_updates");
  },
  async checkSkillUpdates() {
    if (!isTauri) {
      await delay();
      return previewUpdateStatuses;
    }
    return invoke<SkillUpdateStatus[]>("check_skill_updates");
  },
  async updateSkillFromMarket(directoryName: string) {
    if (!isTauri) {
      await delay();
      return {
        directoryName,
        status: "up_to_date",
        message: "预览更新完成"
      } satisfies SkillUpdateResult;
    }
    return invoke<SkillUpdateResult>("update_skill_from_market", { directoryName });
  },
  async updateMarketSkills(directoryNames: string[]) {
    if (!isTauri) {
      await delay();
      return directoryNames.map((directoryName) => ({
        directoryName,
        status: "up_to_date" as const,
        message: "预览更新完成"
      }));
    }
    return invoke<SkillUpdateResult[]>("update_market_skills", { directoryNames });
  },
  async setSkillsRoot(path: string) {
    return invoke<SkillsState>("set_skills_root", { path });
  },
  async setSkillCategory(directoryName: string, categoryId: string) {
    if (!isTauri) {
      await delay();
      const category = skillCategories.find((item) => item.id === categoryId);
      if (!category) throw new Error("分类不存在");
      const skill = skills.find((item) => item.directoryName === directoryName);
      if (skill) {
        skill.categoryId = category.id;
        skill.category = category.name;
      }
      return skillsState();
    }
    return invoke<SkillsState>("set_skill_category", { directoryName, categoryId });
  },
  async createSkillCategory(name: string) {
    if (!isTauri) {
      await delay();
      const normalized = name.trim();
      if (!normalized) throw new Error("分类名称不能为空");
      if (skillCategories.some((category) => category.name === normalized)) throw new Error("分类名称已存在");
      const category = {
        id: `category-${Date.now()}`,
        name: normalized,
        sortOrder: skillCategories.length,
        skillCount: 0
      };
      skillCategories.push(category);
      return skillsState();
    }
    return invoke<SkillsState>("create_skill_category", { name });
  },
  async renameSkillCategory(categoryId: string, name: string) {
    if (!isTauri) {
      await delay();
      const category = skillCategories.find((item) => item.id === categoryId);
      if (!category) throw new Error("分类不存在");
      const normalized = name.trim();
      if (!normalized) throw new Error("分类名称不能为空");
      if (skillCategories.some((item) => item.id !== categoryId && item.name === normalized)) throw new Error("分类名称已存在");
      category.name = normalized;
      skills.forEach((skill) => {
        if (skill.categoryId === categoryId) skill.category = normalized;
      });
      return skillsState();
    }
    return invoke<SkillsState>("rename_skill_category", { categoryId, name });
  },
  async deleteSkillCategory(categoryId: string, replacementCategoryId: string) {
    if (!isTauri) {
      await delay();
      const replacement = skillCategories.find((item) => item.id === replacementCategoryId);
      if (!replacement) throw new Error("迁移目标分类不存在");
      skills.forEach((skill) => {
        if (skill.categoryId === categoryId) {
          skill.categoryId = replacement.id;
          skill.category = replacement.name;
        }
      });
      const index = skillCategories.findIndex((item) => item.id === categoryId);
      if (index >= 0) skillCategories.splice(index, 1);
      return skillsState();
    }
    return invoke<SkillsState>("delete_skill_category", { categoryId, replacementCategoryId });
  },
  async mergeSkillCategory(sourceCategoryId: string, targetCategoryId: string) {
    if (!isTauri) {
      await delay();
      const target = skillCategories.find((item) => item.id === targetCategoryId);
      if (!target) throw new Error("目标分类不存在");
      skills.forEach((skill) => {
        if (skill.categoryId === sourceCategoryId) {
          skill.categoryId = target.id;
          skill.category = target.name;
        }
      });
      const index = skillCategories.findIndex((item) => item.id === sourceCategoryId);
      if (index >= 0) skillCategories.splice(index, 1);
      return skillsState();
    }
    return invoke<SkillsState>("merge_skill_category", { sourceCategoryId, targetCategoryId });
  },
  async importSkillsFromFolder(sourcePath: string) {
    return invoke<ImportResult[]>("import_skills_from_folder", { sourcePath });
  },
  async importSkillsFromZip(zipPath: string) {
    return invoke<ImportResult[]>("import_skills_from_zip", { zipPath });
  },
  async selectSkillImportSource(kind: "zip" | "folder") {
    return invoke<string | null>("select_skill_import_source", { kind });
  },
  async selectDirectory() {
    if (!isTauri) {
      await delay();
      throw new Error("目录选择器仅在 Tauri 桌面应用中可用");
    }
    return invoke<string | null>("select_directory");
  },
  async resolveSkillConflict(
    directoryName: string,
    source: SkillVersionSource
  ) {
    return invoke<SkillsState>("resolve_skill_conflict", { directoryName, source });
  },
  async deleteSkill(directoryName: string) {
    if (!isTauri) {
      await delay();
      for (const item of previewMarketItems) {
        if (item.installedDirectoryName === directoryName || item.skillId === directoryName) {
          item.installedDirectoryName = null;
          item.updateStatus = "not_installed";
        }
      }
      return skillsState();
    }
    return invoke<SkillsState>("delete_skill", { directoryName });
  },
  async setSkillEnabled(
    directoryName: string,
    tool: ToolKey,
    enabled: boolean,
    scope: "global" | "project",
    projectName?: string,
    projectPath?: string
  ) {
    return invoke<SkillsState>("set_skill_enabled", {
      directoryName,
      tool,
      enabled,
      scope,
      projectName,
      projectPath
    });
  },
  async setCloseBehavior(closeBehavior: CloseBehavior) {
    if (!isTauri) {
      settings.closeBehavior = closeBehavior;
      return { settings, skills, categories: previewSkillCategories() };
    }
    return invoke<SkillsState>("set_close_behavior", { closeBehavior });
  },
  async setCloseTrayHintDismissed(dismissed: boolean) {
    if (!isTauri) {
      settings.closeTrayHintDismissed = dismissed;
      return { settings, skills, categories: previewSkillCategories() };
    }
    return invoke<SkillsState>("set_close_tray_hint_dismissed", { dismissed });
  },
  async hideMainWindow() {
    if (!isTauri) return;
    return invoke<void>("hide_main_window");
  },
  async exitApp() {
    if (!isTauri) return;
    return invoke<void>("exit_app");
  },
  async openLocalPath(path: string) {
    return invoke<void>("open_local_path", { path });
  },
  async createAndOpenDirectory(path: string) {
    if (!isTauri) return;
    return invoke<void>("create_and_open_directory", { path });
  },
  async openGlobalSkillTarget(directoryName: string, tool: ToolKey) {
    return invoke<void>("open_global_skill_target", { directoryName, tool });
  },
  async setToolTargetOrder(toolKeys: ToolKey[]) {
    if (!isTauri) {
      const ordered = toolKeys
        .map((key) => settings.toolTargets.find((tool) => tool.key === key))
        .filter((tool): tool is typeof settings.toolTargets[number] => Boolean(tool));
      const missing = settings.toolTargets.filter((tool) => !toolKeys.includes(tool.key));
      settings.toolTargets = [...ordered, ...missing];
      return { settings, skills, categories: previewSkillCategories() };
    }
    return invoke<SkillsState>("set_tool_target_order", { toolKeys });
  },
  async selectToolIconSource() {
    if (!isTauri) {
      await delay();
      throw new Error("图标选择器仅在 Tauri 桌面应用中可用");
    }
    return invoke<string | null>("select_tool_icon_source");
  },
  async saveCustomToolTarget(input: CustomToolTargetInput) {
    if (!isTauri) {
      await delay();
      const normalizedName = input.name.trim().toLowerCase();
      const editingKey = input.key ?? "";
      if (settings.toolTargets.some((tool) => tool.key !== editingKey && tool.name.trim().toLowerCase() === normalizedName)) {
        throw new Error("工具名称已存在");
      }
      const generatedKey = input.key || uniqueCustomToolKey(input.name);
      const target = {
        key: generatedKey,
        name: input.name,
        globalSkillsDir: input.globalSkillsDir,
        supportsProjectScope: false,
        available: false,
        source: "custom" as const,
        iconPath: input.iconSourcePath || input.iconPath || null
      };
      const index = settings.toolTargets.findIndex((tool) => tool.key === generatedKey);
      if (index >= 0) {
        settings.toolTargets[index] = target;
      } else {
        settings.toolTargets.push(target);
      }
      return { settings, skills, categories: previewSkillCategories() };
    }
    return invoke<SkillsState>("save_custom_tool_target", { input });
  },
  async deleteCustomToolTarget(key: ToolKey) {
    if (!isTauri) {
      await delay();
      const index = settings.toolTargets.findIndex((tool) => tool.key === key && tool.source === "custom");
      if (index >= 0) settings.toolTargets.splice(index, 1);
      skills.forEach((skill) => {
        skill.enabledTools = skill.enabledTools.filter((tool) => tool !== key);
        skill.enabledToolMethods = skill.enabledToolMethods.filter((entry) => entry.tool !== key);
        skill.globalToolStates = skill.globalToolStates.filter((entry) => entry.tool !== key);
      });
      return { settings, skills, categories: previewSkillCategories() };
    }
    return invoke<SkillsState>("delete_custom_tool_target", { key });
  },
  async openSkillSourceDirectory(directoryName: string) {
    return invoke<void>("open_skill_source_directory", { directoryName });
  }
};

function uniqueCustomToolKey(name: string) {
  const base = (name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/^-+|-+$/g, "") || "custom-tool");
  const existing = new Set(settings.toolTargets.map((tool) => tool.key));
  if (!existing.has(base)) return base;
  for (let index = 2; index <= 999; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("无法生成自定义工具标识");
}

function createPreviewLaunchRun(project: Project): LaunchRun {
  const id = `preview-${Date.now()}`;
  return {
    id,
    projectId: project.id,
    projectName: project.name,
    startedAt: formatPreviewLaunchTime(new Date()),
    sessions: project.launchConfigs
      .filter((config) => config.enabled && config.command.trim())
      .map((config) => ({
        id: `${id}-${config.id}`,
        launchRunId: id,
        configId: config.id,
        configName: config.name,
        command: config.command,
        workdir: config.workdir,
        status: "running",
        output: [{ stream: "stdout", content: `预览启动中：${config.command}\n` }]
      }))
  };
}

function formatPreviewLaunchTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
