import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { projects, radarItems, settings, skillCategories, skills } from "./mockData";
import type { GitHubStarsSyncResult, ImportResult, LaunchRun, LaunchSession, LaunchSessionEvent, LaunchSessionSnapshot, Project, ProjectOpenProfile, RadarDuplicateGroup, RadarItem, SkillVersionSource, SkillsState, ToolTarget } from "../types/domain";

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
    return invoke<SkillsState>("delete_skill", { directoryName });
  },
  async setSkillEnabled(
    directoryName: string,
    tool: ToolTarget["key"],
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
  async openLocalPath(path: string) {
    return invoke<void>("open_local_path", { path });
  },
  async openGlobalSkillTarget(directoryName: string, tool: ToolTarget["key"]) {
    return invoke<void>("open_global_skill_target", { directoryName, tool });
  },
  async openSkillSourceDirectory(directoryName: string) {
    return invoke<void>("open_skill_source_directory", { directoryName });
  }
};

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
