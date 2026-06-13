export type ViewKey = "projects" | "skills" | "radar" | "settings";

export interface Project {
  id: string;
  name: string;
  path: string;
  note: string;
  tags: string[];
  launchCommand: string;
  launchWorkdir: string;
  status: "configured" | "missing-command" | "reference";
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

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  skillPath: string;
  enabledTools: ToolTarget["key"][];
  enabledProjects: Array<{ projectName: string; tool: ToolTarget["key"] }>;
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
  dataDir: string;
  skillsRoot: string;
  toolTargets: ToolTarget[];
}
