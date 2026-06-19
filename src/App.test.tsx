import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App, CustomToolDialog, ModuleStateView, ProjectDialog, ProjectsView, RadarView, SettingsView, SkillCategoryDialog, SkillsView, applyPendingLaunchEvents, markLaunchRunStopped, mergeLaunchRunSnapshots, rememberUpdateNotice, shouldShowUpdateNotice } from "./App";
import { AppUpdateProvider } from "./contexts/AppUpdateContext";
import type { AppSettings, LaunchSessionEvent, Project, ProjectOpenProfile, RadarDuplicateGroup, RadarItem, Skill, SkillCategory } from "./lib/types/domain";

const activeProject: Project = {
  id: "active",
  name: "Active Project",
  path: "E:\\Active",
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
  note: "archived note",
  tags: ["参考"],
  archived: true,
  launchConfigs: []
};

const secondActiveProject: Project = {
  id: "second",
  name: "Second Project",
  path: "E:\\Second",
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

  it("filters archived projects separately from active projects", async () => {
    const user = userEvent.setup();
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
        onArchive={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getByRole("group", { name: "Active Project 项目" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Archived Project 项目" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("按归档状态筛选项目"), "已归档");

    expect(screen.getByRole("group", { name: "Archived Project 项目" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Active Project 项目" })).not.toBeInTheDocument();
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
        onArchive={vi.fn()}
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
        onArchive={vi.fn()}
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
        onArchive={vi.fn()}
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
        onArchive={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "停止项目" })).toBeInTheDocument();
    expect(screen.queryByText("已启动请求")).not.toBeInTheDocument();
  });

  it("does not allow archiving a project while launch sessions are running", () => {
    const onArchive = vi.fn();
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
        onArchive={onArchive}
        onAdd={vi.fn()}
      />
    );

    expect(within(screen.getByRole("group", { name: "Active Project 项目" })).getByRole("button", { name: "运行中不可归档" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "运行中不可归档" })).toHaveLength(2);
    screen.getAllByRole("button", { name: "运行中不可归档" }).forEach((button) => expect(button).toBeDisabled());
    expect(onArchive).not.toHaveBeenCalled();
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
        onArchive={vi.fn()}
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
        onArchive={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    await user.click(within(screen.getByRole("group", { name: "Second Project 项目" })).getByRole("button", { name: "用工具打开 Second Project" }));
    await user.click(screen.getByRole("menuitem", { name: /VS Code/ }));

    expect(onOpenWithProfile).toHaveBeenCalledWith(secondActiveProject, projectOpenProfiles[0]);
    expect(onSelect).not.toHaveBeenCalled();
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
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={onAddProjectOpenProfile}
        onEditProjectOpenProfile={onEditProjectOpenProfile}
        onDeleteProjectOpenProfile={onDeleteProjectOpenProfile}
      />
    );

    await user.click(screen.getByRole("button", { name: "添加" }));
    await user.click(screen.getByRole("button", { name: "编辑 VS Code" }));
    await user.click(screen.getByRole("button", { name: "删除 VS Code" }));

    expect(screen.getByText("项目打开方式")).toBeInTheDocument();
    expect(screen.getByText('code {projectPath}')).toBeInTheDocument();
    expect(onAddProjectOpenProfile).toHaveBeenCalled();
    expect(onEditProjectOpenProfile).toHaveBeenCalledWith(projectOpenProfiles[0]);
    expect(onDeleteProjectOpenProfile).toHaveBeenCalledWith(projectOpenProfiles[0]);
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
        onOpenPath={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

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
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

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
        onOpenPath={vi.fn()}
        onAddCustomTool={vi.fn()}
        onEditCustomTool={vi.fn()}
        onDeleteCustomTool={vi.fn()}
        onAddProjectOpenProfile={vi.fn()}
        onEditProjectOpenProfile={vi.fn()}
        onDeleteProjectOpenProfile={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("关闭窗口时"), "exit");

    expect(onCloseBehaviorChange).toHaveBeenCalledWith("exit");
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
        onArchive={vi.fn()}
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
        onArchive={vi.fn()}
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
        onArchive={vi.fn()}
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
        onArchive={vi.fn()}
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
    expect(screen.getByRole("button", { name: "同步中" })).toBeDisabled();
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
    await user.click(within(globalRow).getByRole("button", { name: "+3" }));
    await user.click(within(globalRow).getByTitle("Pi Agent · 未启用"));

    expect(within(globalRow).getByText("Pi Agent")).toBeInTheDocument();
    expect(onToggleSkillGlobal).toHaveBeenCalledWith("global-codex", "pi", true);
  });

  it("shows only project-capable tools in the project enablement panel", () => {
    render(
      <SkillsView
        skills={skillsForView}
        selectedSkill={skillsForView[0]}
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

    expect(screen.getByTitle("Active Project · Codex")).toBeInTheDocument();
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
  });

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
});
