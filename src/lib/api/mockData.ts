import type { AppSettings, Project, ProjectOpenProfile, RadarItem, Skill, SkillCategory } from "../types/domain";

export const projects: Project[] = [
  {
    id: "workbench",
    name: "Workbench App",
    path: "E:\\Development\\12-工具-Utility\\Workbench",
    note: "统一管理项目、Skills 与资源 Radar。",
    tags: ["Tauri", "本地工具"],
    archived: false,
    launchConfigs: [
      {
        id: "workbench-dev",
        name: "Workbench",
        command: "pnpm tauri:dev",
        workdir: "E:\\Development\\12-工具-Utility\\Workbench",
        enabled: true
      }
    ]
  },
  {
    id: "ai-radar",
    name: "ai-radar",
    path: "E:\\Development\\01-Web-全栈\\ai-radar",
    note: "AI 信息聚合与趋势面板参考项目。",
    tags: ["信息库", "参考"],
    archived: false,
    launchConfigs: [
      {
        id: "ai-radar-api",
        name: "API",
        command: "uv run uvicorn app.main:app --host 127.0.0.1 --port 8001",
        workdir: "E:\\Development\\01-Web-全栈\\ai-radar",
        enabled: true
      }
    ]
  },
  {
    id: "cc-switch",
    name: "cc-switch",
    path: "E:\\Development\\12-工具-Utility\\Agent\\cc-switch",
    note: "Agent skills 管理方式参考项目。",
    tags: ["Skills", "参考"],
    archived: true,
    launchConfigs: [
      {
        id: "cc-switch-dev",
        name: "cc-switch",
        command: "pnpm tauri dev",
        workdir: "E:\\Development\\12-工具-Utility\\Agent\\cc-switch",
        enabled: true
      }
    ]
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
    directoryName: "security-review",
    name: "security-review",
    description: "认证、用户输入、密钥与敏感功能的安全审查指南。",
    category: "安全",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\security-review\\SKILL.md",
    enabledTools: ["codex", "claude"],
    enabledToolMethods: [{ tool: "codex", syncMethod: "symlink" }, { tool: "claude", syncMethod: "copy" }],
    globalToolStates: [
      { tool: "codex", status: "managed", syncMethod: "symlink" },
      { tool: "claude", status: "managed", syncMethod: "copy" },
      { tool: "opencode", status: "disabled" }
    ],
    enabledProjects: [
      { projectName: "Workbench App", projectPath: "E:\\Development\\12-工具-Utility\\Workbench", tool: "codex", syncMethod: "copy" },
      { projectName: "ai-radar", projectPath: "E:\\Development\\01-Web-全栈\\ai-radar", tool: "codex", syncMethod: "symlink" }
    ]
  },
  {
    id: "playwright-cli",
    directoryName: "playwright-cli",
    name: "playwright-cli",
    description: "浏览器自动化与页面测试。",
    category: "测试",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\playwright-cli\\SKILL.md",
    enabledTools: ["codex"],
    enabledToolMethods: [{ tool: "codex", syncMethod: "copy" }],
    globalToolStates: [
      { tool: "codex", status: "managed", syncMethod: "copy" },
      { tool: "claude", status: "managed", syncMethod: "copy" },
      { tool: "opencode", status: "disabled" }
    ],
    enabledProjects: [{ projectName: "Workbench App", projectPath: "E:\\Development\\12-工具-Utility\\Workbench", tool: "codex", syncMethod: "copy" }]
  },
  {
    id: "design-doc-mermaid",
    directoryName: "design-doc-mermaid",
    name: "design-doc-mermaid",
    description: "从描述或代码生成 Mermaid 图。",
    category: "文档",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\design-doc-mermaid\\SKILL.md",
    enabledTools: ["claude"],
    enabledToolMethods: [{ tool: "claude", syncMethod: "symlink" }],
    globalToolStates: [
      { tool: "codex", status: "conflict" },
      { tool: "claude", status: "managed", syncMethod: "symlink" },
      { tool: "opencode", status: "disabled" }
    ],
    enabledProjects: []
  },
  {
    id: "humanizer",
    directoryName: "humanizer",
    name: "humanizer",
    description: "改善文本自然度与可读性。",
    category: "写作",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\humanizer\\SKILL.md",
    enabledTools: ["codex", "opencode"],
    enabledToolMethods: [{ tool: "codex", syncMethod: "copy" }, { tool: "opencode", syncMethod: "copy" }],
    globalToolStates: [
      { tool: "codex", status: "managed", syncMethod: "copy" },
      { tool: "claude", status: "managed", syncMethod: "copy" },
      { tool: "opencode", status: "managed", syncMethod: "copy" }
    ],
    enabledProjects: [
      { projectName: "Workbench App", projectPath: "E:\\Development\\12-工具-Utility\\Workbench", tool: "codex", syncMethod: "copy" },
      { projectName: "ai-radar", projectPath: "E:\\Development\\01-Web-全栈\\ai-radar", tool: "opencode", syncMethod: "copy" },
      { projectName: "cc-switch", projectPath: "E:\\Development\\12-工具-Utility\\Agent\\cc-switch", tool: "codex", syncMethod: "symlink" }
    ]
  }
];

const manualRadarSource = {
  source: "manual" as const,
  sources: ["manual" as const],
  externalId: "",
  sourceDescription: "",
  sourceMetadata: {
    language: "",
    topics: [] as string[],
    stars: 0,
    repositoryUpdatedAt: ""
  },
  sourceActive: true,
  lastSyncedAt: ""
};

export const radarItems: RadarItem[] = [
  {
    id: "mcp",
    name: "Model Context Protocol",
    category: "项目",
    domain: "Agent",
    url: "https://modelcontextprotocol.io",
    tags: ["MCP", "Agent"],
    note: "连接 AI 应用与外部工具、数据的开放协议。",
    favorite: true,
    updatedAt: "今天",
    ...manualRadarSource
  },
  {
    id: "claude-code-practice",
    name: "Claude Code 最佳实践",
    category: "资讯",
    domain: "Agent",
    url: "https://www.anthropic.com",
    tags: ["Claude", "开发"],
    note: "记录 Claude Code 在本地项目中的使用经验。",
    favorite: true,
    updatedAt: "昨天",
    ...manualRadarSource
  },
  {
    id: "qwen3-report",
    name: "Qwen3 技术报告",
    category: "论文",
    domain: "AI 基础",
    url: "https://qwenlm.github.io",
    tags: ["模型", "论文"],
    note: "本地记录技术报告链接和阅读备注。",
    favorite: false,
    updatedAt: "6月8日",
    ...manualRadarSource
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    category: "项目",
    domain: "开发工具",
    url: "https://openai.com/codex",
    tags: ["Codex", "开发"],
    note: "用于跟踪 Codex 相关能力和本地工作流。",
    favorite: false,
    updatedAt: "6月5日",
    ...manualRadarSource
  }
];

export const projectOpenProfiles: ProjectOpenProfile[] = [
  {
    id: "vscode",
    name: "VS Code",
    kind: "app",
    command: "code",
    executablePath: "",
    args: ["{projectPath}"],
    workdir: "{projectPath}",
    enabled: true,
    sortOrder: 0
  },
  {
    id: "trae",
    name: "Trae",
    kind: "app",
    command: "trae",
    executablePath: "",
    args: ["{projectPath}"],
    workdir: "{projectPath}",
    enabled: true,
    sortOrder: 1
  },
  {
    id: "powershell",
    name: "PowerShell",
    kind: "terminal",
    command: "powershell",
    executablePath: "",
    args: [],
    workdir: "{projectPath}",
    enabled: true,
    sortOrder: 2
  },
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "terminal",
    command: "claude",
    executablePath: "",
    args: [],
    workdir: "{projectPath}",
    enabled: true,
    sortOrder: 3
  }
];

export const settings: AppSettings = {
  workbenchRoot: "C:\\Users\\dev\\.workbench",
  skillsRoot: "C:\\Users\\dev\\.workbench\\skills",
  projectOpenProfiles,
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
