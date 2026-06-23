import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateDialog, AppUpdatePanel, formatReleaseNotes, parseReleaseNotes } from "./AppUpdatePanel";
import { UpdateBadge } from "./UpdateBadge";

const updateState = vi.hoisted(() => ({
  value: {
    status: "idle",
    currentVersion: "0.1.0",
    updateInfo: null as { currentVersion: string; latestVersion: string; body?: string; date?: string } | null,
    downloadProgress: { percent: null as number | null, downloaded: 0, total: null as number | null },
    error: "",
    hasUpdate: false,
    checkUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
    restart: vi.fn()
  }
}));

vi.mock("../contexts/AppUpdateContext", () => ({
  useAppUpdate: () => updateState.value
}));

describe("app update UI", () => {
  beforeEach(() => {
    updateState.value = {
      status: "idle",
      currentVersion: "0.1.0",
      updateInfo: null,
      downloadProgress: { percent: null, downloaded: 0, total: null },
      error: "",
      hasUpdate: false,
      checkUpdate: vi.fn(),
      downloadAndInstall: vi.fn(),
      restart: vi.fn()
    };
  });

  it("hides the sidebar update badge when no update is available", () => {
    render(<UpdateBadge onClick={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /发现新版本/ })).not.toBeInTheDocument();
  });

  it("shows the sidebar update badge when an update is available", () => {
    updateState.value = {
      ...updateState.value,
      status: "available",
      hasUpdate: true,
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0"
      }
    };

    render(<UpdateBadge onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "发现新版本 0.2.0，点击查看更新" })).toBeInTheDocument();
  });

  it("keeps the settings update panel compact and opens the update dialog entry", async () => {
    const user = userEvent.setup();
    const onOpenDetails = vi.fn();
    updateState.value = {
      ...updateState.value,
      status: "available",
      hasUpdate: true,
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0"
      }
    };

    render(<AppUpdatePanel onOpenDetails={onOpenDetails} />);

    expect(screen.getByText("发现新版本 0.2.0")).toBeInTheDocument();
    expect(screen.queryByText("新增更新提示")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /查看更新/ }));

    expect(onOpenDetails).toHaveBeenCalledOnce();
  });

  it("spins the update check icon while checking", () => {
    updateState.value = {
      ...updateState.value,
      status: "checking"
    };

    render(<AppUpdatePanel onOpenDetails={vi.fn()} />);

    const checkButton = screen.getByRole("button", { name: "检查中" });
    expect(checkButton).toBeDisabled();
    expect(checkButton.querySelector("svg")).toHaveClass("spin");
  });

  it("shows release notes and install action in the update dialog", () => {
    updateState.value = {
      ...updateState.value,
      status: "available",
      hasUpdate: true,
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        body: "新增更新提示",
        date: "2026-06-17T04:16:14Z"
      }
    };

    render(<AppUpdateDialog onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "发现新版本" })).toBeInTheDocument();
    expect(screen.getByText("Workbench v0.2.0")).toBeInTheDocument();
    expect(screen.getByText("新增更新提示")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "检查更新" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "稍后" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下载并安装/ })).toBeInTheDocument();
  });

  it("spins the update dialog check icon while checking", () => {
    updateState.value = {
      ...updateState.value,
      status: "checking"
    };

    render(<AppUpdateDialog onClose={vi.fn()} />);

    const checkButton = screen.getByRole("button", { name: "检查中" });
    expect(checkButton).toBeDisabled();
    expect(checkButton.querySelector("svg")).toHaveClass("spin");
  });

  it("formats single-paragraph release notes into scannable points", () => {
    const notes = formatReleaseNotes("新增更新提示。优化更新说明排版；修复终端打开方式。");

    expect(notes).toEqual(["新增更新提示。", "优化更新说明排版；", "修复终端打开方式。"]);
  });

  it("renders release notes as a list in the update dialog", () => {
    updateState.value = {
      ...updateState.value,
      status: "available",
      hasUpdate: true,
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        body: "新增更新提示。优化更新说明排版；修复终端打开方式。"
      }
    };

    render(<AppUpdateDialog onClose={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("优化更新说明排版；")).toBeInTheDocument();
  });

  it("parses markdown release notes into structured sections", () => {
    const notes = parseReleaseNotes(`## [0.2.0] - 2026-06-20

### Added

- 新增技能市场
- 增加批量更新

### Fixed

- 修复更新复选框`);

    expect(notes.versionTitle).toBe("[0.2.0] - 2026-06-20");
    expect(notes.sections).toEqual([
      { key: "added", title: "新增功能", items: ["新增技能市场", "增加批量更新"] },
      { key: "fixed", title: "问题修复", items: ["修复更新复选框"] }
    ]);
  });

  it("renders markdown release notes as grouped update sections", () => {
    updateState.value = {
      ...updateState.value,
      status: "available",
      hasUpdate: true,
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        body: `## [0.2.0] - 2026-06-20

### Added

- 新增技能市场

### Security

- 增加下载大小限制`
      }
    };

    render(<AppUpdateDialog onClose={vi.fn()} />);

    expect(screen.getByText("[0.2.0] - 2026-06-20")).toBeInTheDocument();
    expect(screen.getByText("新增 1")).toBeInTheDocument();
    expect(screen.getByText("安全 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /新增功能/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /安全改进/ })).toBeInTheDocument();
    expect(screen.queryByText(/### Added/)).not.toBeInTheDocument();
  });

  it("shows download progress while updating", () => {
    updateState.value = {
      ...updateState.value,
      status: "downloading",
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0"
      },
      downloadProgress: { percent: 42, downloaded: 42 * 1024 * 1024, total: 100 * 1024 * 1024 }
    };

    render(<AppUpdateDialog onClose={vi.fn()} />);

    expect(screen.getByText("正在下载更新 42%")).toBeInTheDocument();
    expect(screen.getByText("42.0 MB / 100.0 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /更新中/ })).toBeDisabled();
  });

  it("offers restart after update installation is ready", async () => {
    const user = userEvent.setup();
    updateState.value = {
      ...updateState.value,
      status: "ready-to-restart",
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0"
      }
    };

    render(<AppUpdateDialog onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /重启完成更新/ }));

    expect(updateState.value.restart).toHaveBeenCalledOnce();
  });

  it("explains missing release metadata in Chinese in the update dialog", () => {
    updateState.value = {
      ...updateState.value,
      status: "error",
      error: "还没有发布可用于自动更新的 Release 元数据（latest.json）。发布第一版带更新产物的 GitHub Release 后，检查更新才会返回真实结果。"
    };

    render(<AppUpdateDialog onClose={vi.fn()} />);

    expect(screen.getByText(/还没有发布可用于自动更新的 Release 元数据/)).toBeInTheDocument();
  });
});
