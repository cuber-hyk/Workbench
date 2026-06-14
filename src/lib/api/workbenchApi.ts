import { invoke } from "@tauri-apps/api/core";
import { projects, radarItems, settings, skillCategories, skills } from "./mockData";
import type { ImportResult, Project, RadarItem, SkillVersionSource, SkillsState, ToolTarget } from "../types/domain";

const delay = async () => new Promise((resolve) => window.setTimeout(resolve, 80));
const isTauri = "__TAURI_INTERNALS__" in window;

async function skillsState(): Promise<SkillsState> {
  if (isTauri) {
    return await invoke<SkillsState>("get_skills_state");
  }
  await delay();
  return { settings, skills };
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
      return;
    }
    return invoke<void>("launch_project", {
      name: project.name,
      launchConfigs: project.launchConfigs
    });
  },
  async listSkills() {
    return (await skillsState()).skills;
  },
  async listSkillCategories() {
    await delay();
    return skillCategories;
  },
  async listRadarItems() {
    if (isTauri) {
      return invoke<RadarItem[]>("list_radar_items");
    }
    await delay();
    return radarItems;
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
  async getSettings() {
    return (await skillsState()).settings;
  },
  async getSkillsState() {
    return skillsState();
  },
  async setSkillsRoot(path: string) {
    return invoke<SkillsState>("set_skills_root", { path });
  },
  async setSkillCategory(directoryName: string, category: string) {
    return invoke<SkillsState>("set_skill_category", { directoryName, category });
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
