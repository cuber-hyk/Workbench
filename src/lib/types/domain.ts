export type ViewKey = "projects" | "skills" | "radar" | "settings";

export interface Project {
  id: string;
  name: string;
  path: string;
  note: string;
  tags: string[];
  launchConfigs: ProjectLaunchConfig[];
}

export interface ProjectLaunchConfig {
  id: string;
  name: string;
  command: string;
  workdir: string;
  enabled: boolean;
}

export interface SkillCategory {
  id: string;
  name: string;
}

export interface ToolTarget {
  key: "codex" | "claude" | "opencode";
  name: string;
  globalSkillsDir: string;
  supportsProjectScope: boolean;
  available: boolean;
}

export type SkillVersionSource = "workbench" | ToolTarget["key"];

export interface Skill {
  id: string;
  directoryName: string;
  name: string;
  description: string;
  category: string;
  skillPath: string;
  enabledTools: ToolTarget["key"][];
  enabledToolMethods: Array<{ tool: ToolTarget["key"]; syncMethod: "symlink" | "copy" }>;
  globalToolStates: Array<{
    tool: ToolTarget["key"];
    status: "disabled" | "managed" | "conflict";
    syncMethod?: "symlink" | "copy";
  }>;
  enabledProjects: Array<{
    projectName: string;
    projectPath: string;
    tool: ToolTarget["key"];
    syncMethod: "symlink" | "copy";
  }>;
}

export type RadarCategory = "项目" | "资讯" | "论文" | "其他";

export interface RadarItem {
  id: string;
  name: string;
  category: RadarCategory;
  url: string;
  tags: string[];
  note: string;
  favorite: boolean;
  updatedAt: string;
}

export interface AppSettings {
  workbenchRoot: string;
  skillsRoot: string;
  toolTargets: ToolTarget[];
}

export interface SkillsState {
  settings: AppSettings;
  skills: Skill[];
}

export interface ImportResult {
  directoryName: string;
  status: "imported" | "conflict" | "invalid";
  message: string;
}
