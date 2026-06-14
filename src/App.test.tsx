import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App, ModuleStateView, ProjectDialog, ProjectsView, RadarView } from "./App";
import type { Project, RadarItem } from "./lib/types/domain";

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

const radarItems: RadarItem[] = [
  {
    id: "nano",
    name: "nano-vllm",
    category: "项目",
    url: "https://github.com/GeeeekExplorer/nano-vllm",
    tags: ["vLLM"],
    note: "轻量推理引擎",
    favorite: true,
    updatedAt: "2026-06-14"
  },
  {
    id: "paper",
    name: "Attention Paper",
    category: "论文",
    url: "",
    tags: ["论文"],
    note: "论文记录",
    favorite: false,
    updatedAt: "2026-06-13"
  }
];

describe("Workbench UI interactions", () => {
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

  it("filters Radar items by search and category", async () => {
    const user = userEvent.setup();
    render(
      <RadarView
        items={radarItems}
        selectedItem={radarItems[0]}
        loading={false}
        loadError=""
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onOpenLink={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("按分类筛选"), "论文");

    expect(screen.getByRole("button", { name: /Attention Paper/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nano-vllm/ })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("搜索名称、标签或备注"));
    await user.type(screen.getByLabelText("搜索名称、标签或备注"), "attention");

    expect(screen.getByRole("button", { name: /Attention Paper/ })).toBeInTheDocument();
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

  it("keeps navigation names available after theme toggle", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    render(<App />);

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).getByRole("button", { name: "项目" })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "Skills" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "浅色主题" }));

    expect(document.body.dataset.theme).toBe("dark");
    expect(within(navigation).getByRole("button", { name: "AI Radar" })).toBeInTheDocument();
  });
});
