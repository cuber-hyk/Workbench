import { invoke } from "@tauri-apps/api/core";
import { projects, radarItems, settings, skillCategories, skills } from "./mockData";

const delay = async () => new Promise((resolve) => window.setTimeout(resolve, 80));

export const workbenchApi = {
  async health() {
    try {
      return await invoke<string>("app_health");
    } catch {
      return "web-preview";
    }
  },
  async listProjects() {
    await delay();
    return projects;
  },
  async listSkills() {
    await delay();
    return skills;
  },
  async listSkillCategories() {
    await delay();
    return skillCategories;
  },
  async listRadarItems() {
    await delay();
    return radarItems;
  },
  async getSettings() {
    await delay();
    return settings;
  }
};
