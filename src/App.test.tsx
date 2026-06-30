import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App, ModuleStateView, rememberUpdateNotice, shouldShowUpdateNotice } from "./App";
import { ProjectDialog } from "./components/dialogs/projects/ProjectDialog";
import { RemoteProjectImportDialog } from "./components/dialogs/projects/RemoteProjectImportDialog";
import { CustomToolDialog } from "./components/dialogs/settings/CustomToolDialog";
import { ExternalSkillsDialog } from "./components/dialogs/skills/ExternalSkillsDialog";
import { GithubSkillImportDialog } from "./components/dialogs/skills/GithubSkillImportDialog";
import { SkillCategoryDialog } from "./components/dialogs/skills/SkillCategoryDialog";
import { SkillsRootMigrationDialog } from "./components/dialogs/skills/SkillsRootMigrationDialog";
import { AppUpdateProvider } from "./contexts/AppUpdateContext";
import { getDiagnosticEnvironment } from "./lib/api/diagnosticsApi";
import { workbenchApi } from "./lib/api/workbenchApi";
import type { AppSettings, ExternalSkillCandidateGroup, LaunchSessionEvent, Project, ProjectImportProgress, ProjectOpenProfile, RadarDuplicateGroup, RadarItem, RemoteProjectImportInspection, RemoteProjectImportRequest, Skill, SkillCategory, SkillMarketItem, SkillMarketResponse, SkillUpdateResult, SkillsRootMigrationState, SkillsState } from "./lib/types/domain";
import { ProjectsView } from "./views/projects/ProjectsView";
import { applyPendingLaunchEvents, markLaunchRunStopped, mergeLaunchRunSnapshots } from "./views/projects/launchState";
import { RadarView } from "./views/radar/RadarView";
import { SettingsView } from "./views/settings/SettingsView";
import { SkillsMarketView } from "./views/skills/SkillsMarketView";
import { clearSkillMarketRuntimeCache, SkillsView } from "./views/skills/SkillsView";
import { buildMarketStats } from "./views/skills/skillMarketFormatters";
import designTokens from "../design-tokens.json";

const activeProject: Project = {
  id: "active",
  name: "Active Project",
  path: "E:\\Active",
  sourceUrl: "",
  note: "active note",
  tags: ["Tauri"],
  archived: false,
  launchConfigs: [
    {
      id: "active-dev",
      name: "Dev",
      command: "pnpm dev",
      workdir: "E:\\Active",
      enabled: true
    }
  ]
};

const archivedProject: Project = {
  id: "archived",
  name: "Archived Project",
  path: "E:\\Archived",
  sourceUrl: "",
  note: "archived note",
  tags: ["参考"],
  archived: true,
  launchConfigs: []
};

const secondActiveProject: Project = {
  id: "second",
  name: "Second Project",
  path: "E:\\Second",
  sourceUrl: "",
  note: "second note",
  tags: ["Node"],
  archived: false,
  launchConfigs: [
    {
      id: "second-dev",
      name: "Dev",
      command: "pnpm dev",
      workdir: "E:\\Second",
      enabled: true
    }
  ]
};

const projectOpenProfiles: ProjectOpenProfile[] = [
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
    id: "claude-code",
    name: "Claude Code",
    kind: "terminal",
    command: "claude",
    executablePath: "",
    args: [],
    workdir: "{projectPath}",
    enabled: true,
    sortOrder: 1
  }
];

const appSettings: AppSettings = {
  workbenchRoot: "C:\\Users\\dev\\.workbench",
  skillsRoot: "C:\\Users\\dev\\.workbench\\skills",
  closeBehavior: "hide_to_tray",
  closeTrayHintDismissed: false,
  launchAtStartup: false,
  startHiddenToTray: false,
  githubTokenConfigured: false,
  projectOpenProfiles,
  toolTargets: [
    {
      key: "codex",
      name: "Codex",
      globalSkillsDir: "C:\\Users\\dev\\.codex\\skills",
      supportsProjectScope: true,
      available: true
    }
  ]
};

const skillsSettings: AppSettings = {
  ...appSettings,
  toolTargets: [
    appSettings.toolTargets[0],
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
      globalSkillsDir: "C:\\Users\\dev\\.opencode\\skills",
      supportsProjectScope: true,
      available: true
    }
  ]
};

const customToolSettings: AppSettings = {
  ...skillsSettings,
  toolTargets: [
    ...skillsSettings.toolTargets,
    {
      key: "my-agent",
      name: "My Agent",
      globalSkillsDir: "C:\\Users\\dev\\.my-agent\\skills",
      supportsProjectScope: false,
      available: true,
      source: "custom",
      iconPath: "my-agent.svg"
    }
  ]
};

const expandedSkillsSettings: AppSettings = {
  ...skillsSettings,
  toolTargets: [
    ...skillsSettings.toolTargets,
    {
      key: "deveco",
      name: "DevEco Code",
      globalSkillsDir: "C:\\Users\\dev\\.config\\deveco\\skills",
      supportsProjectScope: false,
      available: false
    },
    {
      key: "hermes",
      name: "Hermes",
      globalSkillsDir: "C:\\Users\\dev\\.hermes\\skills",
      supportsProjectScope: false,
      available: false
    },
    {
      key: "kimi",
      name: "Kimi Code",
      globalSkillsDir: "C:\\Users\\dev\\.kimi-code\\skills",
      supportsProjectScope: false,
      available: false
    },
    {
      key: "pi",
      name: "Pi Agent",
      globalSkillsDir: "C:\\Users\\dev\\.pi\\agent\\skills",
      supportsProjectScope: false,
      available: false
    }
  ]
};

const skillCategoriesForView: SkillCategory[] = [
  { id: "security", name: "安全", sortOrder: 0, skillCount: 1 },
  { id: "testing", name: "测试", sortOrder: 1, skillCount: 1 },
  { id: "docs", name: "文档", sortOrder: 2, skillCount: 1 },
  { id: "writing", name: "写作", sortOrder: 3, skillCount: 1 },
  { id: "uncategorized", name: "未分类", sortOrder: 4, skillCount: 0 }
];

const skillsForView: Skill[] = [
  {
    id: "global-codex",
    directoryName: "global-codex",
    name: "global-codex",
    description: "Global Codex skill",
    sourceUrl: "",
    categoryId: "security",
    category: "安全",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\global-codex\\SKILL.md",
    enabledTools: ["codex"],
    enabledToolMethods: [{ tool: "codex", syncMethod: "symlink" }],
    globalToolStates: [
      { tool: "codex", status: "managed", syncMethod: "symlink" },
      { tool: "claude", status: "disabled" },
      { tool: "opencode", status: "disabled" }
    ],
    enabledProjects: []
  },
  {
    id: "project-claude-active",
    directoryName: "project-claude-active",
    name: "project-claude-active",
    description: "Active project Claude skill",
    sourceUrl: "",
    categoryId: "testing",
    category: "测试",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\project-claude-active\\SKILL.md",
    enabledTools: [],
    enabledToolMethods: [],
    globalToolStates: [
      { tool: "codex", status: "disabled" },
      { tool: "claude", status: "disabled" },
      { tool: "opencode", status: "disabled" }
    ],
    enabledProjects: [{ projectName: activeProject.name, projectPath: activeProject.path, tool: "claude", syncMethod: "copy" }]
  },
  {
    id: "project-codex-second",
    directoryName: "project-codex-second",
    name: "project-codex-second",
    description: "Second project Codex skill",
    sourceUrl: "",
    categoryId: "docs",
    category: "文档",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\project-codex-second\\SKILL.md",
    enabledTools: [],
    enabledToolMethods: [],
    globalToolStates: [
      { tool: "codex", status: "disabled" },
      { tool: "claude", status: "disabled" },
      { tool: "opencode", status: "disabled" }
    ],
    enabledProjects: [{ projectName: secondActiveProject.name, projectPath: secondActiveProject.path, tool: "codex", syncMethod: "copy" }]
  },
  {
    id: "disabled-skill",
    directoryName: "disabled-skill",
    name: "disabled-skill",
    description: "Disabled skill",
    sourceUrl: "",
    categoryId: "writing",
    category: "写作",
    skillPath: "C:\\Users\\dev\\.workbench\\skills\\disabled-skill\\SKILL.md",
    enabledTools: [],
    enabledToolMethods: [],
    globalToolStates: [
      { tool: "codex", status: "disabled" },
      { tool: "claude", status: "disabled" },
      { tool: "opencode", status: "disabled" }
    ],
    enabledProjects: []
  }
];

function testMarketItems(): SkillMarketItem[] {
  return [
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
      source: "open.feishu.cn",
      skillId: "lark-doc",
      name: "lark-doc",
      description: "Operate Feishu docs.",
      installs: 256800,
      official: false,
      installedDirectoryName: null,
      updateStatus: "unsupported",
      installable: false
    }
  ];
}

function testMarketResponse(items = testMarketItems(), query = ""): SkillMarketResponse {
  return {
    items,
    mode: query ? "search" : "leaderboard",
    query,
    loaded: items.length,
    hasMore: false,
    limit: query ? 100 : null,
    message: null
  };
}

function installedSkillsState(): SkillsState {
  return {
    settings: skillsSettings,
    skills: [
      ...skillsForView,
      {
        ...skillsForView[0],
        id: "next-upgrade",
        directoryName: "next-upgrade",
        name: "next-upgrade",
        description: "Upgrade Next.js following official migration guides.",
        skillPath: "C:\\Users\\dev\\.workbench\\skills\\next-upgrade\\SKILL.md"
      }
    ],
    categories: skillCategoriesForView
  };
}

function renderWithUpdateProvider(ui: ReactElement) {
  return render(<AppUpdateProvider>{ui}</AppUpdateProvider>);
}

const radarItems: RadarItem[] = [
  {
    id: "nano",
    name: "nano-vllm",
    category: "项目",
    domain: "AI 基础",
    url: "https://github.com/GeeeekExplorer/nano-vllm",
    tags: ["vLLM"],
    note: "轻量推理引擎",
    favorite: true,
    updatedAt: "2026-06-14",
    source: "github_star",
    sources: ["github_star"],
    externalId: "GeeeekExplorer/nano-vllm",
    sourceDescription: "GitHub description",
    sourceMetadata: { language: "Python", topics: ["inference"], stars: 100, repositoryUpdatedAt: "2026-06-14" },
    sourceActive: true,
    lastSyncedAt: "2026-06-15"
  },
  {
    id: "paper",
    name: "Attention Paper",
    category: "论文",
    domain: "RAG",
    url: "",
    tags: ["论文"],
    note: "论文记录",
    favorite: false,
    updatedAt: "2026-06-13",
    source: "manual",
    sources: ["manual"],
    externalId: "",
    sourceDescription: "",
    sourceMetadata: { language: "", topics: [], stars: 0, repositoryUpdatedAt: "" },
    sourceActive: true,
    lastSyncedAt: ""
  }
];

const radarDuplicateGroups: RadarDuplicateGroup[] = [
  {
    id: "github_star:GeeeekExplorer/nano-vllm",
    source: "github_star",
    externalId: "GeeeekExplorer/nano-vllm",
    candidateIds: ["nano", "paper"],
    candidates: radarItems,
    status: "open",
    updatedAt: "2026-06-15"
  }
];

describe("Workbench UI interactions", () => {
  it("tracks whether an update version has already shown a discovery notice", () => {
    const remembered = new Map<string, string>();
    const storage = {
      getItem: (key: string) => remembered.get(key) ?? null,
      setItem: (key: string, value: string) => {
        remembered.set(key, value);
      }
    };

    expect(shouldShowUpdateNotice("0.2.0", storage)).toBe(true);

    rememberUpdateNotice("0.2.0", storage);

    expect(shouldShowUpdateNotice("0.2.0", storage)).toBe(false);
    expect(shouldShowUpdateNotice("0.2.1", storage)).toBe(true);
  });

  it("shows legacy archived project records as normal projects", () => {
    render(
      <ProjectsView
        projects={[activeProject, archivedProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{}}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getByRole("group", { name: "Active Project 项目" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Archived Project 项目" })).toBeInTheDocument();
    expect(screen.queryByLabelText("按归档状态筛选项目")).not.toBeInTheDocument();
  });

  it("opens local or remote project import from the add menu", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onAddRemote = vi.fn();
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{}}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={onAdd}
        onAddRemote={onAddRemote}
      />
    );

    await user.click(screen.getByRole("button", { name: "添加项目" }));
    await user.click(screen.getByRole("menuitem", { name: "本地导入" }));
    expect(onAdd).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "添加项目" }));
    await user.click(screen.getByRole("menuitem", { name: "GitHub/Gitee 导入" }));
    expect(onAddRemote).toHaveBeenCalledOnce();
  });

  it("shows the source action in project details only for trusted source URLs", async () => {
    const user = userEvent.setup();
    const onOpenSource = vi.fn();
    const sourcedProject = {
      ...activeProject,
      sourceUrl: "https://github.com/acme/active"
    };
    render(
      <ProjectsView
        projects={[sourcedProject, secondActiveProject]}
        selectedProject={sourcedProject}
        projectLaunchTimes={{}}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onOpenSource={onOpenSource}
        onLaunch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    const sourceAction = screen.getByRole("button", { name: "查看来源" });
    expect(screen.getByDisplayValue(sourcedProject.sourceUrl)).toBeInTheDocument();

    await user.click(sourceAction);

    expect(onOpenSource).toHaveBeenCalledWith(sourcedProject.sourceUrl);
    expect(within(screen.getByRole("group", { name: "Second Project 项目" })).queryByRole("button", { name: "查看来源" })).not.toBeInTheDocument();
  });

  it("paginates projects and selects the first project on the new page", async () => {
    const user = userEvent.setup();
    const projects = Array.from({ length: 55 }, (_, index) => ({
      ...activeProject,
      id: `project-${String(index + 1).padStart(2, "0")}`,
      name: `Project ${String(index + 1).padStart(2, "0")}`,
      path: `E:\\Project-${String(index + 1).padStart(2, "0")}`,
      launchConfigs: []
    }));
    const onSelect = vi.fn();
    render(
      <ProjectsView
        projects={projects}
        selectedProject={projects[0]}
        projectLaunchTimes={{}}
        loading={false}
        loadError=""
        onSelect={onSelect}
        onLaunch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getByRole("group", { name: "Project 01 项目" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Project 51 项目" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByRole("group", { name: "Project 51 项目" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Project 01 项目" })).not.toBeInTheDocument();
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("project-51"));
  });

  it("jumps to an editable project page within the legal page range", async () => {
    const user = userEvent.setup();
    const projects = Array.from({ length: 125 }, (_, index) => ({
      ...activeProject,
      id: `project-${String(index + 1).padStart(3, "0")}`,
      name: `Project ${String(index + 1).padStart(3, "0")}`,
      path: `E:\\Project-${String(index + 1).padStart(3, "0")}`,
      launchConfigs: []
    }));
    const onSelect = vi.fn();
    render(
      <ProjectsView
        projects={projects}
        selectedProject={projects[0]}
        projectLaunchTimes={{}}
        loading={false}
        loadError=""
        onSelect={onSelect}
        onLaunch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    const pageInput = screen.getByLabelText("项目列表分页当前页");
    await user.clear(pageInput);
    await user.type(pageInput, "3{Enter}");

    expect(screen.getByRole("group", { name: "Project 101 项目" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Project 001 项目" })).not.toBeInTheDocument();
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("project-101"));

    await user.clear(pageInput);
    await user.type(pageInput, "99{Enter}");

    expect(pageInput).toHaveValue("3");
    expect(screen.getByRole("group", { name: "Project 101 项目" })).toBeInTheDocument();
  });

  it("shows the latest launch run summary without inline output", () => {
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={{
          id: "run-1",
          projectId: "active",
          projectName: "Active Project",
          startedAt: "06/14 10:30",
          sessions: [
            {
              id: "session-frontend",
              launchRunId: "run-1",
              configId: "active-dev",
              configName: "Frontend",
              command: "pnpm dev",
              workdir: "E:\\Active",
              status: "running",
              output: [{ stream: "stdout", content: "ready in 812ms" }]
            },
            {
              id: "session-worker",
              launchRunId: "run-1",
              configId: "active-worker",
              configName: "Worker",
              command: "pnpm worker",
              workdir: "E:\\Active",
              status: "failed",
              exitCode: 1,
              output: [{ stream: "stderr", content: "missing env DATABASE_URL" }]
            }
          ]
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getAllByText("启动项").length).toBeGreaterThan(0);
    expect(screen.queryByText("本次启动")).not.toBeInTheDocument();
    expect(screen.queryByText("启动配置")).not.toBeInTheDocument();
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看日志" })).toBeInTheDocument();
    expect(screen.queryByText("ready in 812ms")).not.toBeInTheDocument();
    expect(screen.queryByText("missing env DATABASE_URL")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止全部会话" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "停止会话" }).filter((button) => !button.hasAttribute("disabled"))).toHaveLength(1);
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
    expect(screen.getByText("失败 1")).toBeInTheDocument();
  });

  it("opens launch log details with all and per-session output tabs", async () => {
    const user = userEvent.setup();
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={{
          id: "run-1",
          projectId: "active",
          projectName: "Active Project",
          startedAt: "06/14 10:30",
          sessions: [
            {
              id: "session-frontend",
              launchRunId: "run-1",
              configId: "active-dev",
              configName: "Frontend",
              command: "pnpm dev",
              workdir: "E:\\Active",
              status: "running",
              output: [{ stream: "stdout", content: "ready in 812ms\n" }]
            },
            {
              id: "session-worker",
              launchRunId: "run-1",
              configId: "active-worker",
              configName: "Worker",
              command: "pnpm worker",
              workdir: "E:\\Active",
              status: "failed",
              exitCode: 1,
              output: [{ stream: "stderr", content: "missing env DATABASE_URL\n" }]
            }
          ]
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "查看日志" }));

    expect(screen.getByRole("heading", { name: "Active Project 启动日志" })).toBeInTheDocument();
    expect(screen.getByText("项目 / Active Project / 本次启动日志")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回项目列表" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "全部" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("[Frontend] ready in 812ms")).toBeInTheDocument();
    expect(screen.getByText("[Worker] missing env DATABASE_URL")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Frontend" }));

    expect(screen.getByRole("tab", { name: "Frontend" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("ready in 812ms")).toBeInTheDocument();
    expect(screen.queryByText("[Worker] missing env DATABASE_URL")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回项目列表" }));

    expect(screen.getByRole("group", { name: "Active Project 项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看日志" })).toBeInTheDocument();
  });

  it("renders launch log urls as clickable actions", async () => {
    const user = userEvent.setup();
    const onOpenLogUrl = vi.fn();
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={{
          id: "run-1",
          projectId: "active",
          projectName: "Active Project",
          startedAt: "06/14 10:30",
          sessions: [
            {
              id: "session-frontend",
              launchRunId: "run-1",
              configId: "active-dev",
              configName: "Frontend",
              command: "uv run uvicorn app.main:app",
              workdir: "E:\\Active",
              status: "running",
              output: [{ stream: "stderr", content: "Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)\n" }]
            }
          ]
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onOpenLogUrl={onOpenLogUrl}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "查看日志" }));
    await user.click(screen.getByRole("button", { name: "打开链接 http://127.0.0.1:8001" }));

    expect(onOpenLogUrl).toHaveBeenCalledWith("http://127.0.0.1:8001");
  });

  it("uses active launch sessions to show project status and stop action", () => {
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={{
          id: "run-1",
          projectId: "active",
          projectName: "Active Project",
          startedAt: "06/14 10:30",
          sessions: [
            {
              id: "session-frontend",
              launchRunId: "run-1",
              configId: "active-dev",
              configName: "Frontend",
              command: "pnpm dev",
              workdir: "E:\\Active",
              status: "running",
              output: []
            }
          ]
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "停止项目" })).toBeInTheDocument();
    expect(screen.queryByText("已启动请求")).not.toBeInTheDocument();
  });

  it("does not allow deleting a project while launch sessions are running", () => {
    const onDelete = vi.fn();
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={{
          id: "run-1",
          projectId: "active",
          projectName: "Active Project",
          startedAt: "06/14 10:30",
          sessions: [
            {
              id: "session-frontend",
              launchRunId: "run-1",
              configId: "active-dev",
              configName: "Frontend",
              command: "pnpm dev",
              workdir: "E:\\Active",
              status: "running",
              output: []
            }
          ]
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onAdd={vi.fn()}
      />
    );

    expect(within(screen.getByRole("group", { name: "Active Project 项目" })).getByRole("button", { name: "运行中不可删除" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "运行中不可删除" })).toHaveLength(2);
    screen.getAllByRole("button", { name: "运行中不可删除" }).forEach((button) => expect(button).toBeDisabled());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes a project record after manual confirmation", async () => {
    const user = userEvent.setup();
    const listProjects = vi.spyOn(workbenchApi, "listProjects").mockResolvedValue([activeProject]);
    const deleteProject = vi.spyOn(workbenchApi, "deleteProject").mockResolvedValue([]);
    try {
      renderWithUpdateProvider(<App />);

      await screen.findByRole("group", { name: "Active Project 项目" });
      await user.click(screen.getAllByRole("button", { name: "删除项目记录" })[0]);

      expect(screen.getByRole("dialog", { name: "删除项目记录" })).toBeInTheDocument();
      expect(screen.getByText("此操作只会从 Workbench 项目列表中删除记录，不会删除本地项目文件。")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await waitFor(() => expect(deleteProject).toHaveBeenCalledWith("active"));
    } finally {
      listProjects.mockRestore();
      deleteProject.mockRestore();
    }
  });

  it("offers deleting the project record when opening a missing project directory", async () => {
    const user = userEvent.setup();
    const listProjects = vi.spyOn(workbenchApi, "listProjects").mockResolvedValue([activeProject]);
    const openLocalPath = vi.spyOn(workbenchApi, "openLocalPath").mockRejectedValue(new Error("路径不存在"));
    const deleteProject = vi.spyOn(workbenchApi, "deleteProject").mockResolvedValue([]);
    try {
      renderWithUpdateProvider(<App />);

      const row = await screen.findByRole("group", { name: "Active Project 项目" });
      await user.click(within(row).getByRole("button", { name: "打开目录" }));

      expect(await screen.findByRole("dialog", { name: "删除项目记录" })).toBeInTheDocument();
      expect(screen.getByText("Workbench 访问项目目录时发现路径不存在，可能已被移动或删除。")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await waitFor(() => expect(deleteProject).toHaveBeenCalledWith("active"));
      expect(openLocalPath).toHaveBeenCalledWith("E:\\Active");
    } finally {
      listProjects.mockRestore();
      openLocalPath.mockRestore();
      deleteProject.mockRestore();
    }
  });

  it("offers deleting the project record when launch workdir is missing", async () => {
    const user = userEvent.setup();
    const listProjects = vi.spyOn(workbenchApi, "listProjects").mockResolvedValue([activeProject]);
    const launchProject = vi.spyOn(workbenchApi, "launchProject").mockRejectedValue(new Error("启动工作目录不存在: E:\\Active"));
    const deleteProject = vi.spyOn(workbenchApi, "deleteProject").mockResolvedValue([]);
    try {
      renderWithUpdateProvider(<App />);

      const row = await screen.findByRole("group", { name: "Active Project 项目" });
      await user.click(within(row).getByRole("button", { name: "启动项目" }));

      expect(await screen.findByRole("dialog", { name: "删除项目记录" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await waitFor(() => expect(deleteProject).toHaveBeenCalledWith("active"));
      expect(launchProject).toHaveBeenCalledWith(activeProject);
    } finally {
      listProjects.mockRestore();
      launchProject.mockRestore();
      deleteProject.mockRestore();
    }
  });

  it("runs project row actions without selecting the row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(
      <ProjectsView
        projects={[activeProject, secondActiveProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{}}
        loading={false}
        loadError=""
        onSelect={onSelect}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    await user.click(within(screen.getByRole("group", { name: "Second Project 项目" })).getByRole("button", { name: "编辑项目" }));

    expect(onEdit).toHaveBeenCalledWith(secondActiveProject);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens a project with a configured tool without selecting the row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenWithProfile = vi.fn();
    render(
      <ProjectsView
        projects={[activeProject, secondActiveProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{}}
        projectOpenProfiles={projectOpenProfiles}
        loading={false}
        loadError=""
        onSelect={onSelect}
        onOpenWithProfile={onOpenWithProfile}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    await user.click(within(screen.getByRole("group", { name: "Second Project 项目" })).getByRole("button", { name: "用工具打开 Second Project" }));
    await user.click(screen.getByRole("menuitem", { name: /VS Code/ }));

    expect(onOpenWithProfile).toHaveBeenCalledWith(secondActiveProject, projectOpenProfiles[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps only one project open-profile menu open and closes it from outside", async () => {
    const user = userEvent.setup();
    render(
      <ProjectsView
        projects={[activeProject, secondActiveProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{}}
        projectOpenProfiles={projectOpenProfiles}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onOpenWithProfile={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    await user.click(within(screen.getByRole("group", { name: "Active Project 项目" })).getByRole("button", { name: "用工具打开 Active Project" }));
    expect(screen.getByRole("menu", { name: "Active Project 打开方式" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "Second Project 项目" })).getByRole("button", { name: "用工具打开 Second Project" }));
    expect(screen.queryByRole("menu", { name: "Active Project 打开方式" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Second Project 打开方式" })).toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "项目" }));
    expect(screen.queryByRole("menu", { name: "Second Project 打开方式" })).not.toBeInTheDocument();
  });

  it("shows project open profiles in settings actions", async () => {
    const user = userEvent.setup();
    const onAddProjectOpenProfile = vi.fn();
    const onEditProjectOpenProfile = vi.fn();
    const onDeleteProjectOpenProfile = vi.fn();
    renderWithUpdateProvider(
      <SettingsView
        settings={appSettings}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onReorderToolTargets={vi.fn()}
        onCloseBehaviorChange={vi.fn()}
        onLaunchAtStartupChange={vi.fn()}
        onStartHiddenToTrayChange={vi.fn()}
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={onAddProjectOpenProfile}
        onEditProjectOpenProfile={onEditProjectOpenProfile}
        onDeleteProjectOpenProfile={onDeleteProjectOpenProfile}
      />
    );

    await user.click(screen.getByRole("button", { name: /项目打开方式/ }));
    await user.click(screen.getByRole("button", { name: "添加" }));
    await user.click(screen.getByRole("button", { name: "编辑 VS Code" }));
    await user.click(screen.getByRole("button", { name: "删除 VS Code" }));

    expect(screen.getByRole("heading", { name: "项目打开方式" })).toBeInTheDocument();
    expect(screen.getByText('code {projectPath}')).toBeInTheDocument();
    expect(onAddProjectOpenProfile).toHaveBeenCalled();
    expect(onEditProjectOpenProfile).toHaveBeenCalledWith(projectOpenProfiles[0]);
    expect(onDeleteProjectOpenProfile).toHaveBeenCalledWith(projectOpenProfiles[0]);
  });

  it("spins the settings migration check while inspecting root migration", async () => {
    const user = userEvent.setup();
    renderWithUpdateProvider(
      <SettingsView
        settings={appSettings}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onInspectRootMigration={vi.fn()}
        inspectingRootMigration
        onReorderToolTargets={vi.fn()}
        onCloseBehaviorChange={vi.fn()}
        onLaunchAtStartupChange={vi.fn()}
        onStartHiddenToTrayChange={vi.fn()}
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Skills统一根目录与映射" }));
    const checkButton = screen.getByRole("button", { name: "检查中" });
    expect(checkButton).toBeDisabled();
    expect(checkButton.querySelector("svg")).toHaveClass("spin");
  });

  it("configures GitHub token from skills settings without echoing saved values", async () => {
    const user = userEvent.setup();
    const onSaveGithubToken = vi.fn().mockResolvedValue(undefined);
    const onClearGithubToken = vi.fn().mockResolvedValue(undefined);
    const onTestGithubToken = vi.fn().mockResolvedValue(undefined);
    renderWithUpdateProvider(
      <SettingsView
        settings={{ ...appSettings, githubTokenConfigured: true }}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onReorderToolTargets={vi.fn()}
        onCloseBehaviorChange={vi.fn()}
        onLaunchAtStartupChange={vi.fn()}
        onStartHiddenToTrayChange={vi.fn()}
        onSaveGithubToken={onSaveGithubToken}
        onClearGithubToken={onClearGithubToken}
        onTestGithubToken={onTestGithubToken}
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Skills统一根目录与映射" }));
    expect(screen.getByText("已配置")).toBeInTheDocument();
    const tokenInput = screen.getByLabelText("GitHub Token");
    expect(tokenInput).toHaveValue("");
    expect(tokenInput).toHaveAttribute("type", "password");
    await user.type(tokenInput, "ghp_secret_preview");
    await user.click(screen.getByRole("button", { name: "显示 Token" }));
    expect(tokenInput).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "隐藏 Token" }));
    expect(tokenInput).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "测试" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await user.click(screen.getByRole("button", { name: "清除" }));

    await waitFor(() => {
      expect(onTestGithubToken).toHaveBeenCalledWith("ghp_secret_preview");
      expect(onSaveGithubToken).toHaveBeenCalledWith("ghp_secret_preview");
      expect(onClearGithubToken).toHaveBeenCalledOnce();
    });
    expect(tokenInput).toHaveValue("");
  });

  it("groups root migration footer actions and spins while refreshing", () => {
    const migrationState: SkillsRootMigrationState = {
      previousSkillsRoot: "C:\\Users\\dev\\.old-workbench\\skills",
      currentSkillsRoot: "C:\\Users\\dev\\.workbench\\skills",
      canMigrate: true,
      candidates: [{
        directoryName: "new-skill",
        displayName: "new-skill",
        description: "New skill",
        status: "new",
        sourcePath: "C:\\Users\\dev\\.old-workbench\\skills\\new-skill",
        message: "可迁移"
      }],
      managedTargets: [{
        directoryName: "new-skill",
        tool: "codex",
        scope: "global",
        projectName: "",
        projectPath: "",
        linkPath: "C:\\Users\\dev\\.codex\\skills\\new-skill",
        syncMethod: "symlink",
        status: "ready",
        message: "可重建"
      }]
    };

    const { container } = render(
      <SkillsRootMigrationDialog
        state={migrationState}
        rebuildResults={[]}
        refreshing
        onMigrate={vi.fn()}
        onRebuild={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const refreshButton = screen.getByRole("button", { name: "检查中" });
    expect(refreshButton).toBeDisabled();
    expect(refreshButton.querySelector("svg")).toHaveClass("spin");
    const footerActions = container.querySelector(".migration-footer-actions");
    expect(footerActions).not.toBeNull();
    expect(within(footerActions as HTMLElement).getByRole("button", { name: "关闭" })).toBeInTheDocument();
    expect(within(footerActions as HTMLElement).getByRole("button", { name: "迁移可迁移项" })).toBeInTheDocument();
    expect(within(footerActions as HTMLElement).getByRole("button", { name: "重建受管目标" })).toBeInTheDocument();
  });

  it("shows custom tool actions and icon in settings", async () => {
    const user = userEvent.setup();
    const onEditCustomTool = vi.fn();
    const onDeleteCustomTool = vi.fn();
    const { container } = renderWithUpdateProvider(
      <SettingsView
        settings={customToolSettings}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onReorderToolTargets={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={onEditCustomTool}
        onDeleteCustomTool={onDeleteCustomTool}
        onCloseBehaviorChange={vi.fn()}
        onLaunchAtStartupChange={vi.fn()}
        onStartHiddenToTrayChange={vi.fn()}
        onOpenPath={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /工具目录/ }));
    await user.click(screen.getByRole("button", { name: "编辑 My Agent" }));
    await user.click(screen.getByRole("button", { name: "删除 My Agent" }));

    expect(screen.getByText("自定义")).toBeInTheDocument();
    const toolIconSources = Array.from(container.querySelectorAll(".settings-tool-icon img")).map((image) => image.getAttribute("src"));
    expect(toolIconSources).toContain("my-agent.svg");
    expect(onEditCustomTool).toHaveBeenCalledWith(customToolSettings.toolTargets[3]);
    expect(onDeleteCustomTool).toHaveBeenCalledWith(customToolSettings.toolTargets[3]);
  });

  it("keeps custom tool internal keys hidden and shows form errors inline", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CustomToolDialog
        existingTools={skillsSettings.toolTargets}
        onSelectDirectory={() => Promise.resolve(null)}
        onSelectIcon={() => Promise.resolve(null)}
        onError={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText("工具 Key")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("工具名称"), "Codex");
    await user.type(screen.getByLabelText("全局 Skills 目录"), "C:\\Users\\dev\\.codex\\skills");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("工具名称已存在")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("reorders global tool display order from settings", async () => {
    const user = userEvent.setup();
    const onReorderToolTargets = vi.fn();
    renderWithUpdateProvider(
      <SettingsView
        settings={skillsSettings}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onReorderToolTargets={onReorderToolTargets}
        onCloseBehaviorChange={vi.fn()}
        onLaunchAtStartupChange={vi.fn()}
        onStartHiddenToTrayChange={vi.fn()}
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /工具目录/ }));
    await user.click(screen.getByRole("button", { name: "下移 Codex" }));

    expect(onReorderToolTargets).toHaveBeenCalledWith(["claude", "codex", "opencode"]);
  });

  it("updates close behavior from settings", async () => {
    const user = userEvent.setup();
    const onCloseBehaviorChange = vi.fn();
    renderWithUpdateProvider(
      <SettingsView
        settings={skillsSettings}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onReorderToolTargets={vi.fn()}
        onCloseBehaviorChange={onCloseBehaviorChange}
        onLaunchAtStartupChange={vi.fn()}
        onStartHiddenToTrayChange={vi.fn()}
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /应用行为/ }));
    await user.selectOptions(screen.getByLabelText("关闭窗口时"), "exit");

    expect(onCloseBehaviorChange).toHaveBeenCalledWith("exit");
  });

  it("updates startup behavior toggles from settings", async () => {
    const user = userEvent.setup();
    const onLaunchAtStartupChange = vi.fn();
    const onStartHiddenToTrayChange = vi.fn();
    renderWithUpdateProvider(
      <SettingsView
        settings={skillsSettings}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onReorderToolTargets={vi.fn()}
        onCloseBehaviorChange={vi.fn()}
        onLaunchAtStartupChange={onLaunchAtStartupChange}
        onStartHiddenToTrayChange={onStartHiddenToTrayChange}
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /应用行为/ }));
    await user.click(screen.getByLabelText("开机时启动 Workbench"));
    await user.click(screen.getByLabelText("启动后隐藏到托盘"));

    expect(screen.getByLabelText("开机时启动 Workbench")).not.toBeChecked();
    expect(screen.getByLabelText("启动后隐藏到托盘")).not.toBeChecked();
    expect(onLaunchAtStartupChange).toHaveBeenCalledWith(true);
    expect(onStartHiddenToTrayChange).toHaveBeenCalledWith(true);
  });

  it("shows diagnostics info and supports copy plus log directory actions", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const onOpenPath = vi.fn();
    const onOpenDirectory = vi.fn();
    const onNotify = vi.fn();

    renderWithUpdateProvider(
      <SettingsView
        settings={skillsSettings}
        theme="dark"
        onOpenUpdateDetails={vi.fn()}
        onThemeToggle={vi.fn()}
        onRootChange={vi.fn()}
        onReorderToolTargets={vi.fn()}
        onCloseBehaviorChange={vi.fn()}
        onLaunchAtStartupChange={vi.fn()}
        onStartHiddenToTrayChange={vi.fn()}
        onOpenPath={onOpenPath}
        onOpenDirectory={onOpenDirectory}
        onNotify={onNotify}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /诊断/ }));

    expect(screen.getByRole("heading", { name: "诊断" })).toBeInTheDocument();
    expect(await screen.findAllByText("web-preview")).toHaveLength(2);
    expect(screen.getByText("C:\\Users\\dev\\.workbench\\workbench.sqlite")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\dev\\.workbench\\logs")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开日志目录" }));
    expect(onOpenDirectory).toHaveBeenCalledWith("C:\\Users\\dev\\.workbench\\logs");

    await user.click(screen.getByRole("button", { name: "打开 Skills 根目录" }));
    expect(onOpenPath).toHaveBeenCalledWith("C:\\Users\\dev\\.workbench\\skills");

    await user.click(screen.getByRole("button", { name: "复制诊断信息" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Workbench Diagnostic Info"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Tauri available: no"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Log directory: C:\\Users\\dev\\.workbench\\logs"));
    expect(onNotify).toHaveBeenCalledWith("诊断信息已复制", "success");

    expect(screen.getByText("未检查")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看结果" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "开始检查" }));
    expect(await screen.findByText("未执行 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看结果" }));
    expect(screen.getByRole("dialog", { name: "检查结果" })).toBeInTheDocument();
    expect(screen.getByText("健康检查仅在 Tauri 桌面应用中运行。")).toBeInTheDocument();
    expect(screen.getByText("未执行")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /本地数据/ }));
    expect(await screen.findByRole("checkbox", { name: "自动备份" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "自动备份保留数量" })).toHaveValue("10");
    await user.click(screen.getByRole("button", { name: "打开备份目录" }));
    expect(onOpenDirectory).toHaveBeenCalledWith("C:\\Users\\dev\\.workbench\\backups");
    await user.click(screen.getByRole("checkbox", { name: "自动备份" }));
    expect(onNotify).toHaveBeenCalledWith("自动备份已开启", "success");
    await user.click(screen.getByRole("button", { name: "创建备份" }));
    expect(onNotify).toHaveBeenCalledWith("本地数据备份与恢复仅在 Tauri 桌面应用中可用。", "danger");

    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: undefined
      });
    }
  });

  it("falls back to web preview diagnostics when Tauri is unavailable", async () => {
    await expect(getDiagnosticEnvironment()).resolves.toEqual({
      runtime: "web-preview",
      tauriAvailable: false,
      platform: "browser",
      arch: "unknown"
    });
  });

  it("tracks active launch sessions for multiple projects at the same time", () => {
    render(
      <ProjectsView
        projects={[activeProject, secondActiveProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30", second: "06/14 10:31" }}
        launchRuns={{
          active: {
            id: "run-active",
            projectId: "active",
            projectName: "Active Project",
            startedAt: "06/14 10:30",
            sessions: [
              {
                id: "session-active",
                launchRunId: "run-active",
                configId: "active-dev",
                configName: "Dev",
                command: "pnpm dev",
                workdir: "E:\\Active",
                status: "running",
                output: []
              }
            ]
          },
          second: {
            id: "run-second",
            projectId: "second",
            projectName: "Second Project",
            startedAt: "06/14 10:31",
            sessions: [
              {
                id: "session-second",
                launchRunId: "run-second",
                configId: "second-dev",
                configName: "Dev",
                command: "pnpm dev",
                workdir: "E:\\Second",
                status: "running",
                output: []
              }
            ]
          }
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getByRole("group", { name: "Active Project 项目" })).toHaveTextContent("运行中");
    expect(screen.getByRole("group", { name: "Second Project 项目" })).toHaveTextContent("运行中");
    expect(screen.getAllByRole("button", { name: "停止项目" })).toHaveLength(2);
  });

  it("shows partial running when only some launch sessions were stopped", () => {
    const onRestartLaunchSession = vi.fn();
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={{
          id: "run-1",
          projectId: "active",
          projectName: "Active Project",
          startedAt: "06/14 10:30",
          sessions: [
            {
              id: "session-frontend",
              launchRunId: "run-1",
              configId: "active-dev",
              configName: "Frontend",
              command: "pnpm dev",
              workdir: "E:\\Active",
              status: "running",
              output: []
            },
            {
              id: "session-worker",
              launchRunId: "run-1",
              configId: "active-worker",
              configName: "Worker",
              command: "pnpm worker",
              workdir: "E:\\Active",
              status: "stopped",
              output: []
            }
          ]
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onRestartLaunchSession={onRestartLaunchSession}
        onClearLaunchRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getAllByText("部分运行").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "停止项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止全部会话" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "停止会话" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "重新启动此项" })).toBeInTheDocument();
  });

  it("offers restart and close actions after all launch sessions ended", async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    const onClearLaunchRun = vi.fn();
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={{
          id: "run-1",
          projectId: "active",
          projectName: "Active Project",
          startedAt: "06/14 10:30",
          sessions: [
            {
              id: "session-frontend",
              launchRunId: "run-1",
              configId: "active-dev",
              configName: "Frontend",
              command: "pnpm dev",
              workdir: "E:\\Active",
              status: "stopped",
              output: []
            }
          ]
        }}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={onLaunch}
        onStopLaunchSession={vi.fn()}
        onStopLaunchRun={vi.fn()}
        onClearLaunchRun={onClearLaunchRun}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getAllByText("已停止").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "停止全部会话" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新启动全部" }));
    await user.click(screen.getByRole("button", { name: "关闭本次记录" }));

    expect(onLaunch).toHaveBeenCalledWith(activeProject);
    expect(onClearLaunchRun).toHaveBeenCalledTimes(1);
  });

  it("returns to launchable status after the latest launch run is closed", () => {
    render(
      <ProjectsView
        projects={[activeProject]}
        selectedProject={activeProject}
        projectLaunchTimes={{ active: "06/14 10:30" }}
        launchRun={null}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onLaunch={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getAllByText("可启动").length).toBeGreaterThan(0);
    expect(screen.queryByText("已启动")).not.toBeInTheDocument();
  });

  it("keeps launch output events that arrive before the launch run is rendered", () => {
    const pendingEvents: Record<string, LaunchSessionEvent[]> = {
      "run-1": [
        {
          launchRunId: "run-1",
          sessionId: "session-frontend",
          eventType: "output",
          stream: "stdout",
          content: "Uvicorn running on http://127.0.0.1:8001\n"
        }
      ]
    };

    const launchRun = applyPendingLaunchEvents(
      {
        id: "run-1",
        projectId: "active",
        projectName: "Active Project",
        startedAt: "06/14 10:30",
        sessions: [
          {
            id: "session-frontend",
            launchRunId: "run-1",
            configId: "active-dev",
            configName: "Frontend",
            command: "pnpm dev",
            workdir: "E:\\Active",
            status: "running",
            output: []
          }
        ]
      },
      pendingEvents
    );

    expect(launchRun.sessions[0].output).toEqual([
      { stream: "stdout", content: "Uvicorn running on http://127.0.0.1:8001\n" }
    ]);
    expect(pendingEvents["run-1"]).toBeUndefined();
  });

  it("keeps Tauri launch output events when payload fields use backend casing", () => {
    const pendingEvents: Record<string, LaunchSessionEvent[]> = {
      "run-1": [
        {
          launch_run_id: "run-1",
          session_id: "session-frontend",
          event_type: "Output",
          stream: "Stdout",
          content: "Uvicorn running on http://127.0.0.1:8001\n"
        } as unknown as LaunchSessionEvent
      ]
    };

    const launchRun = applyPendingLaunchEvents(
      {
        id: "run-1",
        projectId: "active",
        projectName: "Active Project",
        startedAt: "06/14 10:30",
        sessions: [
          {
            id: "session-frontend",
            launchRunId: "run-1",
            configId: "active-dev",
            configName: "Frontend",
            command: "pnpm dev",
            workdir: "E:\\Active",
            status: "running",
            output: []
          }
        ]
      },
      pendingEvents
    );

    expect(launchRun.sessions[0].output).toEqual([
      { stream: "stdout", content: "Uvicorn running on http://127.0.0.1:8001\n" }
    ]);
  });

  it("merges backend launch snapshots into the visible launch run", () => {
    const launchRun = mergeLaunchRunSnapshots(
      {
        id: "run-1",
        projectId: "active",
        projectName: "Active Project",
        startedAt: "06/14 10:30",
        sessions: [
          {
            id: "session-frontend",
            launchRunId: "run-1",
            configId: "active-dev",
            configName: "Frontend",
            command: "pnpm dev",
            workdir: "E:\\Active",
            status: "running",
            output: []
          }
        ]
      },
      [
        {
          launchRunId: "run-1",
          sessionId: "session-frontend",
          status: "running",
          output: [{ stream: "stderr", content: "Uvicorn running on http://127.0.0.1:8001\n" }]
        }
      ]
    );

    expect(launchRun.sessions[0].output).toEqual([
      { stream: "stderr", content: "Uvicorn running on http://127.0.0.1:8001\n" }
    ]);
  });

  it("marks the visible launch session stopped when the stop request already ended on the backend", () => {
    const launchRun = markLaunchRunStopped(
      {
        id: "run-1",
        projectId: "active",
        projectName: "Active Project",
        startedAt: "06/14 10:30",
        sessions: [
          {
            id: "session-frontend",
            launchRunId: "run-1",
            configId: "active-dev",
            configName: "Frontend",
            command: "pnpm dev",
            workdir: "E:\\Active",
            status: "running",
            output: []
          }
        ]
      },
      "session-frontend"
    );

    expect(launchRun.sessions[0].status).toBe("stopped");
  });

  it("shows validation when project path is missing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProjectDialog
        onSelectDirectory={async () => null}
        onError={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "添加项目" }));

    expect(screen.getByText("项目路径不能为空")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits remote project import with selected parent directory and progress", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_request: RemoteProjectImportRequest, onProgress: (progress: ProjectImportProgress) => void) => {
      onProgress({ importId: "import-1", progress: 32, message: "正在克隆仓库" });
    });
    render(
      <RemoteProjectImportDialog
        onSelectDirectory={async () => "E:\\Development\\12-工具-Utility"}
        onInspect={async () => ({
          status: "ready",
          targetPath: "E:\\Development\\12-工具-Utility\\IconCraft-Pro",
          existingProject: null
        })}
        onSelectExisting={vi.fn()}
        onError={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("仓库地址"), "https://github.com/luzong/IconCraft-Pro.git");
    await user.click(screen.getByRole("button", { name: "选择本地父目录" }));
    await user.clear(screen.getByLabelText("标签"));
    await user.type(screen.getByLabelText("标签"), "icon, 图标制作");
    await user.click(screen.getByRole("button", { name: "开始导入" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      repoUrl: "https://github.com/luzong/IconCraft-Pro.git",
      parentDirectory: "E:\\Development\\12-工具-Utility",
      name: "IconCraft-Pro",
      tags: ["icon", "图标制作"]
    });
    expect(screen.getByRole("progressbar", { name: "项目导入进度条" })).toHaveAttribute("aria-valuenow", "32");
  });

  it("selects the existing project when its record and directory both exist", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onSelectExisting = vi.fn();
    render(
      <RemoteProjectImportDialog
        onSelectDirectory={async () => "E:\\Projects"}
        onInspect={async () => ({
          status: "managed_existing",
          targetPath: "E:\\Projects\\demo",
          existingProject: activeProject
        })}
        onSelectExisting={onSelectExisting}
        onError={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("仓库地址"), "https://github.com/owner/demo.git");
    await user.type(screen.getByLabelText("本地父目录"), "E:\\Projects");
    await user.click(screen.getByRole("button", { name: "开始导入" }));

    expect(await screen.findByText("项目已经存在")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看已有项目" }));

    expect(onSelectExisting).toHaveBeenCalledWith("active");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("reimports a managed project only when its local directory is missing", async () => {
    const user = userEvent.setup();
    const inspection: RemoteProjectImportInspection = {
      status: "managed_missing",
      targetPath: "E:\\Projects\\demo",
      existingProject: activeProject
    };
    const onSubmit = vi.fn(async (
      _request: RemoteProjectImportRequest,
      _onProgress: (progress: ProjectImportProgress) => void
    ) => undefined);
    render(
      <RemoteProjectImportDialog
        onSelectDirectory={async () => "E:\\Projects"}
        onInspect={async () => inspection}
        onSelectExisting={vi.fn()}
        onError={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("仓库地址"), "https://github.com/owner/demo.git");
    await user.type(screen.getByLabelText("本地父目录"), "E:\\Projects");
    await user.click(screen.getByRole("button", { name: "开始导入" }));
    expect(await screen.findByText("项目目录已丢失")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新导入" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      projectId: "active",
      replaceProjectId: "active"
    });
  });

  it("requires another parent directory for an unmanaged existing target", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onSelectDirectory = vi.fn(async () => "E:\\Other");
    render(
      <RemoteProjectImportDialog
        onSelectDirectory={onSelectDirectory}
        onInspect={async () => ({
          status: "unmanaged_existing",
          targetPath: "E:\\Projects\\demo",
          existingProject: null
        })}
        onSelectExisting={vi.fn()}
        onError={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("仓库地址"), "https://github.com/owner/demo.git");
    await user.type(screen.getByLabelText("本地父目录"), "E:\\Projects");
    await user.click(screen.getByRole("button", { name: "开始导入" }));
    expect(await screen.findByText("目标目录已存在")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择其他父目录" }));
    expect(onSelectDirectory).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("本地父目录")).toHaveValue("E:\\Other");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a failed progress state when remote import fails", async () => {
    const user = userEvent.setup();
    render(
      <RemoteProjectImportDialog
        onSelectDirectory={async () => "E:\\Projects"}
        onInspect={async () => ({
          status: "ready",
          targetPath: "E:\\Projects\\demo",
          existingProject: null
        })}
        onSelectExisting={vi.fn()}
        onError={vi.fn()}
        onSubmit={async (_request, onProgress) => {
          onProgress({ importId: "import-1", progress: 18, message: "正在检查 Git" });
          throw new Error("Git clone 失败：repository not found");
        }}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("仓库地址"), "https://github.com/owner/demo.git");
    await user.type(screen.getByLabelText("本地父目录"), "E:\\Projects");
    await user.click(screen.getByRole("button", { name: "开始导入" }));

    expect(await screen.findByText("失败")).toBeInTheDocument();
    expect(screen.getByText("Git clone 失败：repository not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新尝试" })).toBeEnabled();
  });

  it("filters resource items by search and category", async () => {
    const user = userEvent.setup();
    render(
      <RadarView
        items={radarItems}
        duplicateGroups={[]}
        selectedItem={radarItems[0]}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
        syncingGithubStars={false}
        onSyncGithubStars={vi.fn()}
        onMergeDuplicateGroup={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("按分类筛选"), "论文");

    expect(screen.getAllByRole("button", { name: /Attention Paper/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /nano-vllm/ })).toHaveLength(0);

    await user.clear(screen.getByLabelText("搜索名称、标签或备注"));
    await user.type(screen.getByLabelText("搜索名称、标签或备注"), "attention");

    expect(screen.getAllByRole("button", { name: /Attention Paper/ }).length).toBeGreaterThan(0);
  });

  it("paginates resource items and moves selection to the current page", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 55 }, (_, index) => ({
      ...radarItems[0],
      id: `radar-${String(index + 1).padStart(2, "0")}`,
      name: `Radar ${String(index + 1).padStart(2, "0")}`,
      url: `https://example.com/${index + 1}`,
      note: `note ${index + 1}`
    }));
    const onSelect = vi.fn();
    render(
      <RadarView
        items={items}
        duplicateGroups={[]}
        selectedItem={items[0]}
        loading={false}
        loadError=""
        onSelect={onSelect}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
        syncingGithubStars={false}
        onSyncGithubStars={vi.fn()}
        onMergeDuplicateGroup={vi.fn()}
      />
    );

    expect(screen.getAllByRole("button", { name: /Radar 01/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Radar 51/ })).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getAllByRole("button", { name: /Radar 51/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Radar 01/ })).toHaveLength(0);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("radar-51"));
  });

  it("filters resources by source and prevents duplicate GitHub sync", async () => {
    const user = userEvent.setup();
    const onSyncGithubStars = vi.fn();
    const { rerender } = render(
      <RadarView
        items={radarItems}
        duplicateGroups={[]}
        selectedItem={radarItems[0]}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
        syncingGithubStars={false}
        onSyncGithubStars={onSyncGithubStars}
        onMergeDuplicateGroup={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("按来源筛选"), "github_star");
    expect(screen.getAllByRole("button", { name: /nano-vllm/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Attention Paper/ })).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "同步 GitHub Stars" }));
    expect(onSyncGithubStars).toHaveBeenCalledOnce();

    rerender(
      <RadarView
        items={radarItems}
        duplicateGroups={[]}
        selectedItem={radarItems[0]}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
        syncingGithubStars
        onSyncGithubStars={onSyncGithubStars}
        onMergeDuplicateGroup={vi.fn()}
      />
    );
    const syncingButton = screen.getByRole("button", { name: "同步中" });
    expect(syncingButton).toBeDisabled();
    expect(syncingButton.querySelector("svg")).toHaveClass("spin");
  });

  it("toggles favorite from the resource list star without selecting the row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <RadarView
        items={radarItems}
        duplicateGroups={[]}
        selectedItem={radarItems[0]}
        loading={false}
        loadError=""
        onSelect={onSelect}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        onOpenLink={vi.fn()}
        syncingGithubStars={false}
        onSyncGithubStars={vi.fn()}
        onMergeDuplicateGroup={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "收藏 Attention Paper" }));

    expect(onToggleFavorite).toHaveBeenCalledWith(radarItems[1]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("uses compact detail icons for resource link edit and row delete actions", async () => {
    const user = userEvent.setup();
    const onOpenLink = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <RadarView
        items={radarItems}
        duplicateGroups={[]}
        selectedItem={radarItems[0]}
        loading={false}
        loadError=""
        onSelect={onSelect}
        onAdd={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleFavorite={vi.fn()}
        onOpenLink={onOpenLink}
        syncingGithubStars={false}
        onSyncGithubStars={vi.fn()}
        onMergeDuplicateGroup={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "取消收藏" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除条目" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开链接" }));
    await user.click(screen.getByRole("button", { name: "编辑条目" }));
    await user.click(screen.getByRole("button", { name: "删除 nano-vllm" }));

    expect(onOpenLink).toHaveBeenCalledWith(radarItems[0].url);
    expect(onEdit).toHaveBeenCalledWith(radarItems[0]);
    expect(onDelete).toHaveBeenCalledWith(radarItems[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("filters resources by domain language duplicate state and merges duplicate groups", async () => {
    const user = userEvent.setup();
    const onMergeDuplicateGroup = vi.fn();
    render(
      <RadarView
        items={radarItems}
        duplicateGroups={radarDuplicateGroups}
        selectedItem={radarItems[0]}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
        syncingGithubStars={false}
        onSyncGithubStars={vi.fn()}
        onMergeDuplicateGroup={onMergeDuplicateGroup}
      />
    );

    await user.selectOptions(screen.getByLabelText("按领域筛选"), "RAG");
    expect(screen.getAllByRole("button", { name: /Attention Paper/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /nano-vllm/ })).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("按领域筛选"), "全部领域");
    await user.click(screen.getByRole("button", { name: "更多筛选" }));
    expect(screen.getByLabelText("按语言筛选")).toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "资源 Radar" }));
    expect(screen.queryByLabelText("按语言筛选")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更多筛选" }));
    await user.selectOptions(screen.getByLabelText("按语言筛选"), "Python");
    expect(screen.getAllByRole("button", { name: /nano-vllm/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Attention Paper/ })).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("按语言筛选"), "全部语言");
    await user.selectOptions(screen.getByLabelText("按重复状态筛选"), "待合并");
    expect(screen.getAllByRole("button", { name: /nano-vllm/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Attention Paper/ }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "合并到此" })[0]);
    expect(onMergeDuplicateGroup).toHaveBeenCalledWith("github_star:GeeeekExplorer/nano-vllm", "nano");
  });

  it("hides details when the selected resource is excluded by filters", async () => {
    const user = userEvent.setup();
    render(
      <RadarView
        items={radarItems}
        duplicateGroups={[]}
        selectedItem={radarItems[1]}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
        syncingGithubStars={false}
        onSyncGithubStars={vi.fn()}
        onMergeDuplicateGroup={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("按来源筛选"), "github_star");
    expect(screen.getByText("选择一个资源条目")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Attention Paper" })).not.toBeInTheDocument();
  });

  it("shows an explicit warning when a GitHub Stars source is inactive", () => {
    const inactiveItem = { ...radarItems[0], sourceActive: false };
    render(
      <RadarView
        items={[inactiveItem]}
        duplicateGroups={[]}
        selectedItem={inactiveItem}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
        syncingGithubStars={false}
        onSyncGithubStars={vi.fn()}
        onMergeDuplicateGroup={vi.fn()}
      />
    );

    expect(screen.getByText("GitHub Stars 来源已失效")).toBeInTheDocument();
    expect(screen.getAllByText(/来源已失效/)).toHaveLength(2);
  });

  it("renders a Skills empty state without a blank module", () => {
    render(
      <ModuleStateView
        title="Skills"
        description="管理统一根目录中的 Skills"
        loading={false}
        error=""
        emptyTitle="暂无 Skills"
        emptyDescription="配置统一根目录并扫描后，可以在这里管理 Skills。"
      />
    );

    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByText("暂无 Skills")).toBeInTheDocument();
  });

  it("filters skills by enabled tool and project scope", async () => {
    const user = userEvent.setup();
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("按启用工具筛选 Skills"), "codex");
    expect(screen.getByRole("group", { name: "global-codex Skill" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "project-codex-second Skill" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "project-claude-active Skill" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("按启用项目筛选 Skills"), secondActiveProject.path);
    expect(screen.queryByRole("group", { name: "global-codex Skill" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "project-codex-second Skill" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("按启用工具筛选 Skills"), "claude");
    await user.selectOptions(screen.getByLabelText("按启用项目筛选 Skills"), activeProject.path);
    expect(screen.getByRole("group", { name: "project-claude-active Skill" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "project-codex-second Skill" })).not.toBeInTheDocument();
  });

  it("shows the source action in skill details only for trusted source URLs", async () => {
    const user = userEvent.setup();
    const onOpenSource = vi.fn();
    const sourcedSkill = {
      ...skillsForView[0],
      sourceUrl: "https://skills.sh/vercel-labs/skills/find-skills"
    };
    render(
      <SkillsView
        skills={[sourcedSkill, ...skillsForView.slice(1)]}
        selectedSkill={sourcedSkill}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onOpenSource={onOpenSource}
        onDeleteSkill={vi.fn()}
      />
    );

    const sourceAction = screen.getByRole("button", { name: "查看来源" });
    expect(screen.getByDisplayValue(sourcedSkill.sourceUrl)).toBeInTheDocument();

    await user.click(sourceAction);

    expect(onOpenSource).toHaveBeenCalledWith(sourcedSkill.sourceUrl);
    expect(within(screen.getByRole("group", { name: "project-claude-active Skill" })).queryByRole("button", { name: "查看来源" })).not.toBeInTheDocument();
  });

  it("disables the skills sync action while syncing", () => {
    const onSyncSkills = vi.fn();
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onSyncSkills={onSyncSkills}
        isSyncingSkills={true}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "同步中" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "同步中" }).querySelector("svg")).toHaveClass("spin");
  });

  it("exposes the enabled skills sync action", async () => {
    const user = userEvent.setup();
    const onSyncSkills = vi.fn();
    const onManageCategories = vi.fn();
    const onImport = vi.fn();
    const onImportGithub = vi.fn();
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={onImport}
        onImportGithub={onImportGithub}
        onRefresh={vi.fn()}
        onSyncSkills={onSyncSkills}
        onManageCategories={onManageCategories}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "同步 Skills" }));
    await user.click(screen.getByRole("button", { name: "管理分类" }));
    await user.click(screen.getByRole("button", { name: /导入 Skills/ }));
    expect(screen.getByText("选择 ZIP 文件")).toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "Skills" }));
    expect(screen.queryByText("选择 ZIP 文件")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /导入 Skills/ }));
    expect(screen.getByText("GitHub 链接")).toBeInTheDocument();
    await user.click(screen.getByText("GitHub 链接"));
    await user.click(screen.getByRole("button", { name: /导入 Skills/ }));
    await user.click(screen.getByText("选择 ZIP 文件"));

    expect(onSyncSkills).toHaveBeenCalledTimes(1);
    expect(onManageCategories).toHaveBeenCalledTimes(1);
    expect(onImportGithub).toHaveBeenCalledOnce();
    expect(onImport).toHaveBeenCalledWith("zip");
  });

  it("previews and imports selected GitHub skill candidates", async () => {
    const user = userEvent.setup();
    const inspectGithub = vi.spyOn(workbenchApi, "inspectGithubSkillImport").mockResolvedValue({
      repoUrl: "https://github.com/acme/skills",
      owner: "acme",
      repo: "skills",
      refName: "main",
      resolvedRef: "abc",
      fixedRef: false,
      scopePath: "",
      message: "发现 1 个 Skill 候选",
      candidates: [
        {
          directoryName: "github-preview-skill",
          displayName: "github-preview-skill",
          description: "GitHub preview",
          skillPath: "",
          markdownPreview: "# GitHub preview",
          fileCount: 2,
          totalSize: 2048,
          hasScripts: false,
          status: "new",
          message: "可导入"
        }
      ]
    });
    const importGithub = vi.spyOn(workbenchApi, "importGithubSkills").mockResolvedValue([
      {
        directoryName: "github-preview-skill",
        status: "imported",
        message: "导入成功"
      }
    ]);
    const onImported = vi.fn();

    try {
      render(<GithubSkillImportDialog onClose={vi.fn()} onImported={onImported} />);
      await user.type(screen.getByLabelText("GitHub 链接"), "https://github.com/acme/skills");
      await user.click(screen.getByRole("button", { name: "扫描" }));

      expect((await screen.findAllByText("github-preview-skill")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("仓库根目录").length).toBeGreaterThan(0);
      expect(screen.getByText("Skill 内容")).toBeInTheDocument();
      expect(screen.getByText("# GitHub preview")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "导入选中项 1" }));

      await waitFor(() => {
        expect(importGithub).toHaveBeenCalledWith("https://github.com/acme/skills", [
          { skillPath: "", overwrite: false }
        ]);
        expect(onImported).toHaveBeenCalledWith([
          {
            directoryName: "github-preview-skill",
            status: "imported",
            message: "导入成功"
          }
        ]);
      });
      expect(inspectGithub).toHaveBeenCalledOnce();
    } finally {
      inspectGithub.mockRestore();
      importGithub.mockRestore();
    }
  });

  it("keeps local Skills management actions out of market and updates", async () => {
    const user = userEvent.setup();
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onSyncSkills={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "同步 Skills" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "技能市场" }));
    expect(screen.queryByRole("button", { name: "同步 Skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "管理分类" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /导入 Skills/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /刷新/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更新" }));
    expect(screen.queryByRole("button", { name: "同步 Skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "管理分类" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /导入 Skills/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /检查/ })).toBeInTheDocument();
  });

  it("requires explicit version choices before syncing conflicting external skills", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    const candidates: ExternalSkillCandidateGroup[] = [
      {
        directoryName: "new-skill",
        displayName: "new-skill",
        description: "",
        status: "new",
        sources: [{
          tool: "codex",
          toolName: "Codex",
          path: "C:\\Users\\dev\\.codex\\skills\\new-skill",
          contentHash: "new",
          readable: true
        }]
      },
      {
        directoryName: "same-skill",
        displayName: "same-skill",
        description: "",
        status: "same_as_current",
        sources: [{
          tool: "deveco",
          toolName: "DevEco Code",
          path: "C:\\Users\\dev\\.config\\deveco\\skills\\same-skill",
          contentHash: "same",
          readable: true
        }]
      },
      {
        directoryName: "conflict-skill",
        displayName: "conflict-skill",
        description: "",
        status: "conflict",
        sources: [{
          tool: "claude",
          toolName: "Claude Code",
          path: "C:\\Users\\dev\\.claude\\skills\\conflict-skill",
          contentHash: "external",
          readable: true
        }]
      }
    ];

    render(
      <ExternalSkillsDialog
        candidates={candidates}
        results={[]}
        loading={false}
        syncing={false}
        skillsRoot="C:\\Users\\dev\\.workbench\\skills"
        onRefresh={vi.fn()}
        onSync={onSync}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "同步" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "全部跳过" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("same-skill DevEco Code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已存在 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "冲突 1" }));
    expect(screen.getByRole("button", { name: "同步" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "全部使用外部" }));
    expect(screen.getByRole("button", { name: "同步" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "全部使用外部" }));
    expect(screen.getByRole("button", { name: "同步" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("conflict-skill Claude Code 同步方式"), "use_external");
    await user.click(screen.getByRole("button", { name: "同步" }));

    expect(onSync).toHaveBeenCalledWith([
      {
        directoryName: "new-skill",
        sourcePath: "C:\\Users\\dev\\.codex\\skills\\new-skill",
        tool: "codex",
        action: "sync"
      },
      {
        directoryName: "conflict-skill",
        sourcePath: "C:\\Users\\dev\\.claude\\skills\\conflict-skill",
        tool: "claude",
        action: "use_external"
      }
    ]);
  });

  it("disables sync actions while applying external skill selections", async () => {
    render(
      <ExternalSkillsDialog
        candidates={[{
          directoryName: "new-skill",
          displayName: "new-skill",
          description: "",
          status: "new",
          sources: [{
            tool: "codex",
            toolName: "Codex",
            path: "C:\\Users\\dev\\.codex\\skills\\new-skill",
            contentHash: "new",
            readable: true
          }]
        }]}
        results={[]}
        loading={false}
        syncing
        skillsRoot="C:\\Users\\dev\\.workbench\\skills"
        onRefresh={vi.fn()}
        onSync={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "同步中" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重新扫描" })).toBeDisabled();
    expect(screen.getByLabelText("new-skill Codex")).toBeDisabled();
  });

  it("shows a toast instead of opening the sync dialog when external skills need no action", async () => {
    const user = userEvent.setup();
    const discoverExternalSkills = vi.spyOn(workbenchApi, "discoverExternalSkills").mockResolvedValue([
      {
        directoryName: "same-skill",
        displayName: "same-skill",
        description: "",
        status: "same_as_current",
        sources: [{
          tool: "codex",
          toolName: "Codex",
          path: "C:\\Users\\dev\\.codex\\skills\\same-skill",
          contentHash: "same",
          readable: true
        }]
      }
    ]);

    try {
      renderWithUpdateProvider(<App />);
      const navigation = await screen.findByRole("navigation", { name: "主导航" });
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(await screen.findByRole("button", { name: "同步 Skills" }));

      expect(await screen.findByText("Skills 已同步，无待处理项；1 项已存在相同内容")).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "同步外部工具 Skills" })).not.toBeInTheDocument();
    } finally {
      discoverExternalSkills.mockRestore();
    }
  });

  it("opens the sync dialog only when external skills need user decisions", async () => {
    const user = userEvent.setup();
    const discoverExternalSkills = vi.spyOn(workbenchApi, "discoverExternalSkills").mockResolvedValue([
      {
        directoryName: "new-skill",
        displayName: "new-skill",
        description: "",
        status: "new",
        sources: [{
          tool: "codex",
          toolName: "Codex",
          path: "C:\\Users\\dev\\.codex\\skills\\new-skill",
          contentHash: "new",
          readable: true
        }]
      }
    ]);

    try {
      renderWithUpdateProvider(<App />);
      const navigation = await screen.findByRole("navigation", { name: "主导航" });
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(await screen.findByRole("button", { name: "同步 Skills" }));

      expect(await screen.findByRole("dialog", { name: "同步外部工具 Skills" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "同步" })).toBeEnabled();
    } finally {
      discoverExternalSkills.mockRestore();
    }
  });

  it("closes the sync dialog and refreshes skills after successful external skill sync", async () => {
    const user = userEvent.setup();
    const discoverExternalSkills = vi.spyOn(workbenchApi, "discoverExternalSkills").mockResolvedValue([
      {
        directoryName: "new-skill",
        displayName: "new-skill",
        description: "",
        status: "new",
        sources: [{
          tool: "codex",
          toolName: "Codex",
          path: "C:\\Users\\dev\\.codex\\skills\\new-skill",
          contentHash: "new",
          readable: true
        }]
      }
    ]);
    const syncExternalSkills = vi.spyOn(workbenchApi, "syncExternalSkills").mockResolvedValue([
      {
        directoryName: "new-skill",
        tool: "codex",
        toolName: "Codex",
        sourcePath: "C:\\Users\\dev\\.codex\\skills\\new-skill",
        status: "synced",
        syncMethod: "symlink",
        backupPath: "C:\\Users\\dev\\.codex\\skills\\.workbench-backups\\new-skill",
        message: "已导入并接管"
      }
    ]);

    try {
      renderWithUpdateProvider(<App />);
      const navigation = await screen.findByRole("navigation", { name: "主导航" });
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(await screen.findByRole("button", { name: "同步 Skills" }));
      await user.click(await screen.findByRole("button", { name: "同步" }));

      expect(await screen.findByText("Skills 已同步：接管 1 项")).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "同步外部工具 Skills" })).not.toBeInTheDocument();
      expect(syncExternalSkills).toHaveBeenCalledWith([{
        directoryName: "new-skill",
        sourcePath: "C:\\Users\\dev\\.codex\\skills\\new-skill",
        tool: "codex",
        action: "sync"
      }]);
    } finally {
      discoverExternalSkills.mockRestore();
      syncExternalSkills.mockRestore();
    }
  });

  it("keeps current external skill candidates visible while rescanning", async () => {
    const user = userEvent.setup();
    let resolveRescan: ((candidates: ExternalSkillCandidateGroup[]) => void) | undefined;
    let rescanStarted = false;
    let rescanPromise: Promise<ExternalSkillCandidateGroup[]> | undefined;
    const firstCandidate: ExternalSkillCandidateGroup = {
      directoryName: "first-skill",
      displayName: "first-skill",
      description: "",
      status: "new",
      sources: [{
        tool: "codex",
        toolName: "Codex",
        path: "C:\\Users\\dev\\.codex\\skills\\first-skill",
        contentHash: "first",
        readable: true
      }]
    };
    const discoverExternalSkills = vi.spyOn(workbenchApi, "discoverExternalSkills")
      .mockImplementation(() => {
        if (!rescanStarted) return Promise.resolve([firstCandidate]);
        rescanPromise ??= new Promise((resolve) => {
          resolveRescan = resolve;
        });
        return rescanPromise;
      });

    try {
      renderWithUpdateProvider(<App />);
      const navigation = await screen.findByRole("navigation", { name: "主导航" });
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(await screen.findByRole("button", { name: "同步 Skills" }));

      expect(await screen.findByText("first-skill")).toBeInTheDocument();
      rescanStarted = true;
      await user.click(screen.getByRole("button", { name: "重新扫描" }));
      expect(await screen.findByRole("button", { name: "扫描中" })).toBeDisabled();
      expect(screen.getByText("first-skill")).toBeInTheDocument();
      await waitFor(() => expect(resolveRescan).toBeDefined());

      await act(async () => {
        resolveRescan?.([
        {
          directoryName: "second-skill",
          displayName: "second-skill",
          description: "",
          status: "new",
          sources: [{
            tool: "codex",
            toolName: "Codex",
            path: "C:\\Users\\dev\\.codex\\skills\\second-skill",
            contentHash: "second",
            readable: true
          }]
        }
        ]);
      });

      expect(await screen.findByText("second-skill")).toBeInTheDocument();
      expect(screen.queryByText("first-skill")).not.toBeInTheDocument();
    } finally {
      discoverExternalSkills.mockRestore();
    }
  });

  it("keeps global tool icons compact and toggles hidden tools from the overflow", async () => {
    const user = userEvent.setup();
    const onToggleSkillGlobal = vi.fn();
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={expandedSkillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={onToggleSkillGlobal}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    const globalRow = screen.getByRole("group", { name: "global-codex Skill" });
    const projectRow = screen.getByRole("group", { name: "project-claude-active Skill" });
    await user.click(within(globalRow).getByRole("button", { name: "+3" }));
    expect(within(globalRow).getByText("Pi Agent")).toBeInTheDocument();
    await user.click(within(projectRow).getByRole("button", { name: "+3" }));
    expect(within(globalRow).queryByText("Pi Agent")).not.toBeInTheDocument();
    expect(within(projectRow).getByText("Pi Agent")).toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "Skills" }));
    expect(within(projectRow).queryByText("Pi Agent")).not.toBeInTheDocument();
    await user.click(within(globalRow).getByRole("button", { name: "+3" }));
    await user.click(within(globalRow).getByTitle("Pi Agent · 未启用"));

    expect(within(globalRow).getByText("Pi Agent")).toBeInTheDocument();
    expect(onToggleSkillGlobal).toHaveBeenCalledWith("global-codex", "pi", true);
  });

  it("summarizes project enablement in the skill inspector", () => {
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[1]}
        categories={skillCategoriesForView}
        settings={expandedSkillsSettings}
        projects={[activeProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    expect(screen.getByText("已启用项目")).toBeInTheDocument();
    expect(screen.getByText("项目级工具启用")).toBeInTheDocument();
    expect(screen.getByText("Copy 同步")).toBeInTheDocument();
    expect(screen.getAllByText("Active Project").length).toBeGreaterThan(1);
    expect(screen.getByText(activeProject.path)).toBeInTheDocument();
    expect(screen.queryByTitle("Active Project · Codex")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Active Project · DevEco Code")).not.toBeInTheDocument();
  });

  it("updates skill categories from a list selector or a new category", async () => {
    const user = userEvent.setup();
    const onCategorySkill = vi.fn();
    const onCreateCategorySkill = vi.fn();
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={onCategorySkill}
        onCreateCategorySkill={onCreateCategorySkill}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    const globalRow = screen.getByRole("group", { name: "global-codex Skill" });
    await user.selectOptions(within(globalRow).getByLabelText("global-codex 分类"), "testing");
    expect(onCategorySkill).toHaveBeenCalledWith("global-codex", "testing");

    await user.selectOptions(within(globalRow).getByLabelText("global-codex 分类"), "__new__");
    await user.type(within(globalRow).getByLabelText("新分类名称"), "效率");
    await user.keyboard("{Enter}");
    expect(onCreateCategorySkill).toHaveBeenCalledWith("global-codex", "效率");
  });

  it("manages skill categories through create, rename, delete and merge actions", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const onMerge = vi.fn();
    render(
      <SkillCategoryDialog
        categories={skillCategoriesForView}
        onClose={vi.fn()}
        onCreate={onCreate}
        onRename={onRename}
        onDelete={onDelete}
        onMerge={onMerge}
      />
    );

    await user.type(screen.getByLabelText("新分类名称"), "效率");
    await user.click(screen.getByRole("button", { name: "新增分类" }));
    expect(onCreate).toHaveBeenCalledWith("效率");

    await user.click(screen.getByRole("button", { name: "重命名 测试" }));
    await user.clear(screen.getByLabelText("测试 新名称"));
    await user.type(screen.getByLabelText("测试 新名称"), "测试工具");
    await user.keyboard("{Enter}");
    expect(onRename).toHaveBeenCalledWith("testing", "测试工具");

    await user.click(screen.getByRole("button", { name: "删除 文档" }));
    await user.selectOptions(screen.getByLabelText("目标分类"), "testing");
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onDelete).toHaveBeenCalledWith("docs", "testing");

    const securityRow = screen.getByText("安全").closest(".category-manager-row");
    expect(securityRow).not.toBeNull();
    await user.click(within(securityRow as HTMLElement).getByRole("button", { name: "合并" }));
    await user.selectOptions(screen.getByLabelText("目标分类"), "docs");
    await user.click(screen.getByRole("button", { name: "确认合并" }));
    expect(onMerge).toHaveBeenCalledWith("security", "docs");

    expect(screen.getByText("系统")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重命名 未分类" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 未分类" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "关闭" })).toHaveLength(1);
  }, 10_000);

  it("does not repeat the skill category in the detail panel", () => {
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    expect(screen.queryByText("分类：安全")).not.toBeInTheDocument();
    expect(screen.queryByText("例如：文档")).not.toBeInTheDocument();
  });

  it("shows skeleton loading while the skills.sh market is loading", async () => {
    const user = userEvent.setup();
    clearSkillMarketRuntimeCache();
    const listMarket = vi.spyOn(workbenchApi, "listSkillMarket").mockReturnValue(new Promise(() => {}));
    try {
      render(
        <SkillsView
          skills={skillsForView}
          selectedSkill={skillsForView[0]}
          categories={skillCategoriesForView}
          settings={skillsSettings}
          projects={[activeProject, secondActiveProject]}
          onSelect={vi.fn()}
          onImport={vi.fn()}
          onRefresh={vi.fn()}
          onManageCategories={vi.fn()}
          onToggle={vi.fn()}
          onToggleSkillGlobal={vi.fn()}
          onToggleProjectAll={vi.fn()}
          onCategorySkill={vi.fn()}
          onCreateCategorySkill={vi.fn()}
          onResolve={vi.fn()}
          onDeleteSkill={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "技能市场" }));

      expect(await screen.findByLabelText("正在加载 skills.sh 市场")).toBeInTheDocument();
      expect(screen.getByLabelText("正在加载 Skill 详情")).toBeInTheDocument();
      const refreshButton = screen.getByRole("button", { name: "刷新中" });
      expect(refreshButton).toBeDisabled();
      expect(refreshButton.querySelector("svg")).toHaveClass("spin");
    } finally {
      listMarket.mockRestore();
    }
  });

  it("shows the market skeleton while refreshing existing skills.sh results", () => {
    const items = testMarketItems();
    render(
      <SkillsMarketView
        items={items}
        selectedItem={items[0]}
        detail={null}
        query=""
        statusFilter="全部状态"
        stats={buildMarketStats(items)}
        currentCount={items.length}
        loadedCount={items.length}
        mode="leaderboard"
        hasMore={false}
        loadingMore={false}
        loading
        error=""
        installTask={null}
        uninstallingKey=""
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onLoadMore={vi.fn()}
        onOpenSource={vi.fn()}
      />
    );

    expect(screen.getByLabelText("正在加载 skills.sh 市场")).toBeInTheDocument();
    expect(screen.getByLabelText("正在加载 Skill 详情")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next-upgrade/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新中" }).querySelector("svg")).toHaveClass("spin");
  });

  it("shows repository icons and text fallback in the skills.sh market source column", () => {
    const items = testMarketItems();
    const { container } = render(
      <SkillsMarketView
        items={items}
        selectedItem={items[0]}
        detail={null}
        query=""
        statusFilter="全部状态"
        stats={buildMarketStats(items)}
        currentCount={items.length}
        loadedCount={items.length}
        mode="leaderboard"
        hasMore={false}
        loadingMore={false}
        loading={false}
        error=""
        installTask={null}
        uninstallingKey=""
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onLoadMore={vi.fn()}
        onOpenSource={vi.fn()}
      />
    );

    expect(container.querySelector('img[src="https://github.com/vercel-labs.png?size=40"]')).toBeInTheDocument();
    expect(container.querySelector(".market-source-cell i")).toHaveTextContent("O");
  });

  it("loads more search results from the next market page after the loaded end", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 60 }, (_, index) => ({
      ...testMarketItems()[0],
      skillId: `market-skill-${index}`,
      name: `market-skill-${index}`
    }));
    const onLoadMore = vi.fn();
    render(
      <SkillsMarketView
        items={items}
        selectedItem={items[0]}
        detail={null}
        query="market"
        statusFilter="全部状态"
        stats={buildMarketStats(items)}
        currentCount={items.length}
        loadedCount={items.length}
        mode="search"
        hasMore
        loadingMore={false}
        loading={false}
        error=""
        installTask={null}
        uninstallingKey=""
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onLoadMore={onLoadMore}
        onOpenSource={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "下一页" }));
    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(onLoadMore).toHaveBeenCalledWith(3, 50);
  });

  it("opens the skills.sh market and installs a selected skill through Workbench", async () => {
    const user = userEvent.setup();
    const progressValues: number[] = [];
    const installSkill = vi.spyOn(workbenchApi, "installSkillFromMarket").mockImplementation(async (_source, _skillId, onProgress) => {
      onProgress?.(55);
      progressValues.push(55);
      return {
      settings: skillsSettings,
      skills: skillsForView,
      categories: skillCategoriesForView
      };
    });
    const onRefresh = vi.fn(async () => {});
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={onRefresh}
        onInstallMarketSkill={(item) => {
          void workbenchApi.installSkillFromMarket(item.source, item.skillId, (progress) => {
            progressValues.push(progress);
          }).then(() => onRefresh());
        }}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "技能市场" }));
    expect((await screen.findAllByText("next-upgrade")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("技能市场统计")).toHaveTextContent("已加载");
    expect(screen.getAllByLabelText("不支持").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "不支持" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("不可安装")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "不可安装" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "安装" }));

    await waitFor(() => {
      expect(installSkill).toHaveBeenCalledWith("vercel-labs/next-skills", "next-upgrade", expect.any(Function));
      expect(progressValues).toContain(55);
      expect(onRefresh).toHaveBeenCalled();
    });
    installSkill.mockRestore();
  });

  it("shows unsupported market items without requesting remote details", async () => {
    const user = userEvent.setup();
    const listMarket = vi.spyOn(workbenchApi, "listSkillMarket").mockResolvedValue(testMarketResponse());
    const getDetail = vi.spyOn(workbenchApi, "getSkillMarketDetail").mockResolvedValue({
      item: testMarketItems()[0],
      repositoryUrl: "https://github.com/vercel-labs/next-skills",
      installCommand: "npx -y skills add vercel-labs/next-skills --skill next-upgrade -g --agent codex -y --copy",
      skillMarkdownPreview: "Upgrade Next.js following official migration guides.",
      securityNote: "Workbench 通过 skills.sh 官方 CLI 安装，并在写入前做结构校验。"
    });

    try {
      render(
        <SkillsView
          skills={skillsForView}
          selectedSkill={skillsForView[0]}
          categories={skillCategoriesForView}
          settings={skillsSettings}
          projects={[activeProject, secondActiveProject]}
          onSelect={vi.fn()}
          onImport={vi.fn()}
          onRefresh={vi.fn()}
          onInstallMarketSkill={vi.fn()}
          onManageCategories={vi.fn()}
          onToggle={vi.fn()}
          onToggleSkillGlobal={vi.fn()}
          onToggleProjectAll={vi.fn()}
          onCategorySkill={vi.fn()}
          onCreateCategorySkill={vi.fn()}
          onResolve={vi.fn()}
          onDeleteSkill={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "技能市场" }));
      await user.selectOptions(screen.getByLabelText("按市场状态筛选"), "不可安装");
      const unsupportedAction = await screen.findByLabelText("不可安装");
      getDetail.mockClear();

      const unsupportedRow = unsupportedAction.closest("button");
      expect(unsupportedRow).toBeDefined();
      await user.click(unsupportedRow as HTMLElement);

      await waitFor(() => {
        expect(getDetail).not.toHaveBeenCalled();
      });
      expect(screen.queryByText(/请求远程来源失败/)).not.toBeInTheDocument();
      expect(screen.getByText("该来源不是 GitHub owner/repo 格式，Workbench 暂不请求远程详情，也不支持安装。")).toBeInTheDocument();
    } finally {
      listMarket.mockRestore();
      getDetail.mockRestore();
    }
  });

  it("keeps market install progress after switching Skills subviews", async () => {
    const user = userEvent.setup();
    let reportProgress: ((progress: number) => void) | undefined;
    let finishInstall: (() => void) | undefined;
    const listMarket = vi.spyOn(workbenchApi, "listSkillMarket").mockResolvedValue(testMarketResponse());
    const installSkill = vi.spyOn(workbenchApi, "installSkillFromMarket").mockImplementation((_source, _skillId, onProgress) => {
      reportProgress = onProgress;
      return new Promise<SkillsState>((resolve) => {
        finishInstall = () => resolve(installedSkillsState());
      });
    });

    try {
      renderWithUpdateProvider(<App />);
      const navigation = await screen.findByRole("navigation", { name: "主导航" });
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(await screen.findByRole("button", { name: "技能市场" }));
      await user.click(await screen.findByRole("button", { name: "安装" }));

      act(() => {
        reportProgress?.(55);
      });
      expect(await screen.findByRole("button", { name: "安装中" })).toBeDisabled();
      expect(screen.getByText("55%")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "本地 Skills" }));
      await user.click(screen.getByRole("button", { name: "技能市场" }));

      expect(await screen.findByRole("button", { name: "安装中" })).toBeDisabled();
      expect(screen.getByText("55%")).toBeInTheDocument();

      await act(async () => {
        finishInstall?.();
      });
    } finally {
      listMarket.mockRestore();
      installSkill.mockRestore();
    }
  });

  it("keeps market install progress after leaving and returning to the Skills page", async () => {
    const user = userEvent.setup();
    let reportProgress: ((progress: number) => void) | undefined;
    let finishInstall: (() => void) | undefined;
    const listMarket = vi.spyOn(workbenchApi, "listSkillMarket").mockResolvedValue(testMarketResponse());
    const installSkill = vi.spyOn(workbenchApi, "installSkillFromMarket").mockImplementation((_source, _skillId, onProgress) => {
      reportProgress = onProgress;
      return new Promise<SkillsState>((resolve) => {
        finishInstall = () => resolve(installedSkillsState());
      });
    });

    try {
      renderWithUpdateProvider(<App />);
      const navigation = await screen.findByRole("navigation", { name: "主导航" });
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(await screen.findByRole("button", { name: "技能市场" }));
      await user.click(await screen.findByRole("button", { name: "安装" }));

      act(() => {
        reportProgress?.(55);
      });
      expect(await screen.findByRole("button", { name: "安装中" })).toBeDisabled();
      expect(screen.getByText("55%")).toBeInTheDocument();

      await user.click(within(navigation).getByRole("button", { name: "项目" }));
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(screen.getByRole("button", { name: "技能市场" }));

      expect(await screen.findByRole("button", { name: "安装中" })).toBeDisabled();
      expect(screen.getByText("55%")).toBeInTheDocument();

      await act(async () => {
        finishInstall?.();
      });
    } finally {
      listMarket.mockRestore();
      installSkill.mockRestore();
    }
  });

  it("keeps the market visible when update refresh fails after a successful install", async () => {
    const user = userEvent.setup();
    const listMarket = vi.spyOn(workbenchApi, "listSkillMarket").mockResolvedValue(testMarketResponse());
    const installSkill = vi.spyOn(workbenchApi, "installSkillFromMarket").mockImplementation(async (_source, _skillId, onProgress) => {
      const { projectOpenProfiles: _missingProjectOpenProfiles, ...settingsWithoutProjectProfiles } = installedSkillsState().settings;
      void _missingProjectOpenProfiles;
      onProgress?.(100);
      return {
        ...installedSkillsState(),
        settings: settingsWithoutProjectProfiles as SkillsState["settings"]
      };
    });
    const listUpdates = vi.spyOn(workbenchApi, "listSkillUpdates").mockRejectedValue(new Error("update refresh failed"));

    try {
      renderWithUpdateProvider(<App />);
      const navigation = await screen.findByRole("navigation", { name: "主导航" });
      await user.click(within(navigation).getByRole("button", { name: "Skills" }));
      await user.click(await screen.findByRole("button", { name: "技能市场" }));
      await user.click(await screen.findByRole("button", { name: "安装" }));

      expect(await screen.findByText(/更新状态刷新失败：update refresh failed/)).toBeInTheDocument();
      expect(screen.getByLabelText("技能市场统计")).toBeInTheDocument();
      expect(screen.queryByText("页面渲染失败")).not.toBeInTheDocument();
    } finally {
      listMarket.mockRestore();
      installSkill.mockRestore();
      listUpdates.mockRestore();
    }
  });

  it("supports selected batch updates for skills.sh installed skills", async () => {
    const user = userEvent.setup();
    const updateSkills = vi.spyOn(workbenchApi, "updateMarketSkills").mockImplementation(async (directoryNames, onProgress) => {
      onProgress?.("excalidraw-diagram-generator", 55);
      return [
        {
          directoryName: "excalidraw-diagram-generator",
          status: "up_to_date",
          message: "更新完成"
        }
      ];
    });
    const onRefresh = vi.fn(async () => {});
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={onRefresh}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "更新" }));
    expect(await screen.findByText("excalidraw-diagram-generator")).toBeInTheDocument();
    const updateCheckbox = screen.getByLabelText("选择 excalidraw-diagram-generator");
    await user.click(updateCheckbox);
    expect(updateCheckbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "更新选中项" }));

    await waitFor(() => {
      expect(updateSkills).toHaveBeenCalledWith(["excalidraw-diagram-generator"], expect.any(Function));
      expect(onRefresh).toHaveBeenCalled();
    });
    updateSkills.mockRestore();
  });

  it("shows progress while updating selected skills", async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((results: SkillUpdateResult[]) => void) | undefined;
    const updateSkills = vi.spyOn(workbenchApi, "updateMarketSkills").mockImplementation((directoryNames, onProgress) => {
      onProgress?.(directoryNames[0], 55);
      return new Promise((resolve) => {
        resolveUpdate = resolve;
      });
    });
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "更新" }));
    expect(await screen.findByText("excalidraw-diagram-generator")).toBeInTheDocument();
    await user.click(screen.getByLabelText("选择 excalidraw-diagram-generator"));
    await user.click(screen.getByRole("button", { name: "更新选中项" }));

    expect(await screen.findByRole("button", { name: "更新中" })).toBeDisabled();
    expect(screen.getByText("当前进度")).toBeInTheDocument();
    expect(screen.getAllByText("更新中 55%").length).toBeGreaterThan(0);
    expect(screen.getByText("55%")).toBeInTheDocument();

    resolveUpdate?.([
      {
        directoryName: "excalidraw-diagram-generator",
        status: "up_to_date",
        message: "更新完成"
      }
    ]);

    await waitFor(() => expect(screen.queryByText("当前进度")).not.toBeInTheDocument());
    updateSkills.mockRestore();
  });

  it("spins the skills update check action while checking", async () => {
    const user = userEvent.setup();
    const listUpdates = vi.spyOn(workbenchApi, "listSkillUpdates").mockReturnValue(new Promise(() => {}));
    try {
      render(
        <SkillsView
          skills={skillsForView}
          selectedSkill={skillsForView[0]}
          categories={skillCategoriesForView}
          settings={skillsSettings}
          projects={[activeProject, secondActiveProject]}
          onSelect={vi.fn()}
          onImport={vi.fn()}
          onRefresh={vi.fn()}
          onManageCategories={vi.fn()}
          onToggle={vi.fn()}
          onToggleSkillGlobal={vi.fn()}
          onToggleProjectAll={vi.fn()}
          onCategorySkill={vi.fn()}
          onCreateCategorySkill={vi.fn()}
          onResolve={vi.fn()}
          onDeleteSkill={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "更新" }));
      const checkButton = await screen.findByRole("button", { name: "检查中" });
      expect(checkButton).toBeDisabled();
      expect(checkButton.querySelector("svg")).toHaveClass("spin");
    } finally {
      listUpdates.mockRestore();
    }
  });

  it("shows an actionable empty state when no skills.sh skills can be checked for updates", async () => {
    const user = userEvent.setup();
    const listUpdates = vi.spyOn(workbenchApi, "listSkillUpdates").mockResolvedValue([]);
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={vi.fn()}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "更新" }));

    expect(await screen.findByText("暂无可检查的远程来源 Skill")).toBeInTheDocument();
    expect(screen.getByText("从技能市场或 GitHub 分支导入的 Skill 会出现在这里，用于检查和执行更新。")).toBeInTheDocument();
    expect(screen.getByText("等待可更新项")).toBeInTheDocument();
    expect(screen.getByText("检查后发现可更新 Skill 时，可在左侧选择并批量更新。")).toBeInTheDocument();
    expect(screen.queryByText(/已选择 0 个可更新 Skill/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "去技能市场" }));
    expect(screen.getByRole("button", { name: "技能市场" })).toHaveClass("active");
    listUpdates.mockRestore();
  });

  it("uninstalls an installed skills.sh market skill through the delete flow", async () => {
    const user = userEvent.setup();
    const deleteSkill = vi.spyOn(workbenchApi, "deleteSkill").mockResolvedValue({
      settings: skillsSettings,
      skills: skillsForView,
      categories: skillCategoriesForView
    });
    const onRefresh = vi.fn(async () => {});
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
        categories={skillCategoriesForView}
        settings={skillsSettings}
        projects={[activeProject, secondActiveProject]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onRefresh={onRefresh}
        onManageCategories={vi.fn()}
        onToggle={vi.fn()}
        onToggleSkillGlobal={vi.fn()}
        onToggleProjectAll={vi.fn()}
        onCategorySkill={vi.fn()}
        onCreateCategorySkill={vi.fn()}
        onResolve={vi.fn()}
        onDeleteSkill={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "技能市场" }));
    await user.click(await screen.findByRole("button", { name: "卸载" }));
    await user.click(screen.getByRole("button", { name: "卸载 Skill" }));

    await waitFor(() => {
      expect(deleteSkill).toHaveBeenCalledWith("excalidraw-diagram-generator");
      expect(onRefresh).toHaveBeenCalled();
    });
    deleteSkill.mockRestore();
  });

  it("keeps navigation names available after theme toggle", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    renderWithUpdateProvider(<App />);

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).getByRole("button", { name: "项目" })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "Skills" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "浅色主题" }));

    expect(document.body.dataset.theme).toBe("dark");
    expect(within(navigation).getByRole("button", { name: "资源 Radar" })).toBeInTheDocument();
  });

  it("renders the Workbench brand with the app icon asset", () => {
    const { container } = renderWithUpdateProvider(<App />);

    const brandMark = container.querySelector<HTMLImageElement>(".brand-mark");
    expect(brandMark).not.toBeNull();
    expect(brandMark?.tagName).toBe("IMG");
    expect(brandMark?.getAttribute("src")).toContain("workbench-icon.png");
    expect(brandMark).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps light and dark sidebar tokens distinct", () => {
    expect(designTokens.color.light.sidebar.$value).toBe("#ffffff");
    expect(designTokens.color.light.sidebarText.$value).toBe("#26313a");
    expect(designTokens.color.dark.sidebar.$value).toBe("#0c1014");
  });

  it("checks GitHub CLI only when syncing stars and reports missing setup in toast", async () => {
    const user = userEvent.setup();
    const checkGithubCliStatus = vi.spyOn(workbenchApi, "checkGithubCliStatus").mockResolvedValue({
      status: "missing",
      account: "",
      message: "未检测到 gh 命令。请先安装 GitHub CLI，并运行 gh auth login 登录后重试。"
    });
    const syncGithubStars = vi.spyOn(workbenchApi, "syncGithubStars");
    renderWithUpdateProvider(<App />);

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    await user.click(within(navigation).getByRole("button", { name: "资源 Radar" }));
    await user.click(screen.getByRole("button", { name: "同步 GitHub Stars" }));

    expect(checkGithubCliStatus).toHaveBeenCalledOnce();
    expect(syncGithubStars).not.toHaveBeenCalled();
    expect(await screen.findByText(/未检测到 gh 命令/)).toBeInTheDocument();
    expect(screen.getByText("gh auth login")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("toast-warning");

    await user.click(screen.getByRole("button", { name: "关闭通知" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    checkGithubCliStatus.mockRestore();
    syncGithubStars.mockRestore();
  });
});
