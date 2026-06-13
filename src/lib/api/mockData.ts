import type { AppSettings, Project, RadarItem, Skill, SkillCategory } from "../types/domain";

export const projects: Project[] = [
  {
    id: "workbench",
    name: "Workbench App",
    path: "E:\\Development\\12-工具-Utility\\Workbench",
    note: "统一管理项目、Skills 与 AI Radar。",
    tags: ["Tauri", "本地工具"],
    launchCommand: "pnpm tauri:dev",
    launchWorkdir: "E:\\Development\\12-工具-Utility\\Workbench",
    status: "configured"
  },
  {
    id: "ai-radar",
    name: "ai-radar",
    path: "E:\\Development\\01-Web-全栈\\ai-radar",
    note: "AI 信息聚合与趋势面板参考项目。",
    tags: ["信息库", "参考"],
    launchCommand: "",
    launchWorkdir: "E:\\Development\\01-Web-全栈\\ai-radar",
    status: "missing-command"
  },
  {
    id: "cc-switch",
    name: "cc-switch",
    path: "E:\\Development\\12-工具-Utility\\Agent\\cc-switch",
    note: "Agent skills 管理方式参考项目。",
    tags: ["Skills", "参考"],
    launchCommand: "pnpm tauri dev",
    launchWorkdir: "E:\\Development\\12-工具-Utility\\Agent\\cc-switch",
    status: "reference"
  }
];

export const skillCategories: SkillCategory[] = [
  { id: "security", name: "安全" },
  { id: "testing", name: "测试" },
  { id: "docs", name: "文档" },
  { id: "writing", name: "写作" }
];

export const skills: Skill[] = [
  {
    id: "security-review",
    name: "security-review",
    description: "认证、用户输入、密钥与敏感功能的安全审查指南。",
    category: "安全",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\security-review\\SKILL.md",
    enabledTools: ["codex", "claude"],
    enabledProjects: [
      { projectName: "Workbench App", tool: "codex" },
      { projectName: "ai-radar", tool: "codex" }
    ]
  },
  {
    id: "playwright-cli",
    name: "playwright-cli",
    description: "浏览器自动化与页面测试。",
    category: "测试",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\playwright-cli\\SKILL.md",
    enabledTools: ["codex"],
    enabledProjects: [{ projectName: "Workbench App", tool: "codex" }]
  },
  {
    id: "design-doc-mermaid",
    name: "design-doc-mermaid",
    description: "从描述或代码生成 Mermaid 图。",
    category: "文档",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\design-doc-mermaid\\SKILL.md",
    enabledTools: ["claude"],
    enabledProjects: []
  },
  {
    id: "humanizer",
    name: "humanizer",
    description: "改善文本自然度与可读性。",
    category: "写作",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\humanizer\\SKILL.md",
    enabledTools: ["codex", "opencode"],
    enabledProjects: [
      { projectName: "Workbench App", tool: "codex" },
      { projectName: "ai-radar", tool: "opencode" },
      { projectName: "cc-switch", tool: "codex" }
    ]
  }
];

export const radarItems: RadarItem[] = [
  {
    id: "mcp",
    name: "Model Context Protocol",
    category: "项目",
    url: "https://modelcontextprotocol.io",
    tags: ["MCP", "Agent"],
    note: "连接 AI 应用与外部工具、数据的开放协议。",
    favorite: true,
    updatedAt: "今天"
  },
  {
    id: "claude-code-practice",
    name: "Claude Code 最佳实践",
    category: "资讯",
    url: "https://www.anthropic.com",
    tags: ["Claude", "开发"],
    note: "记录 Claude Code 在本地项目中的使用经验。",
    favorite: true,
    updatedAt: "昨天"
  },
  {
    id: "qwen3-report",
    name: "Qwen3 技术报告",
    category: "论文",
    url: "https://qwenlm.github.io",
    tags: ["模型", "论文"],
    note: "本地记录技术报告链接和阅读备注。",
    favorite: false,
    updatedAt: "6月8日"
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    category: "项目",
    url: "https://openai.com/codex",
    tags: ["Codex", "开发"],
    note: "用于跟踪 Codex 相关能力和本地工作流。",
    favorite: false,
    updatedAt: "6月5日"
  }
];

export const settings: AppSettings = {
  dataDir: "C:\\Users\\dev\\AppData\\Roaming\\workbench-app",
  skillsRoot: "C:\\Users\\dev\\.workbench\\skills",
  toolTargets: [
    {
      key: "codex",
      name: "Codex",
      globalSkillsDir: "C:\\Users\\dev\\.codex\\skills",
      supportsProjectScope: true,
      available: true
    },
    {
      key: "claude",
      name: "Claude Code",
      globalSkillsDir: "C:\\Users\\dev\\.claude\\skills",
      supportsProjectScope: true,
      available: true
    },
    {
      key: "opencode",
      name: "OpenCode",
      globalSkillsDir: "C:\\Users\\dev\\.config\\opencode\\skills",
      supportsProjectScope: true,
      available: true
    }
  ]
};
