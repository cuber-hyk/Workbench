import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdatePanel } from "./AppUpdatePanel";
import { UpdateBadge } from "./UpdateBadge";

const updateState = vi.hoisted(() => ({
  value: {
    status: "idle",
    currentVersion: "0.1.0",
    updateInfo: null as { currentVersion: string; latestVersion: string; body?: string } | null,
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

  it("shows install action in the settings update panel when an update is available", () => {
    updateState.value = {
      ...updateState.value,
      status: "available",
      hasUpdate: true,
      updateInfo: {
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        body: "新增更新提示"
      }
    };

    render(<AppUpdatePanel />);

    expect(screen.getByText("软件更新")).toBeInTheDocument();
    expect(screen.getByText("0.2.0")).toBeInTheDocument();
    expect(screen.getByText("新增更新提示")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下载并安装/ })).toBeInTheDocument();
  });

  it("explains missing release metadata in Chinese when update check cannot fetch latest.json", () => {
    updateState.value = {
      ...updateState.value,
      status: "error",
      error: "还没有发布可用于自动更新的 Release 元数据（latest.json）。发布第一版带更新产物的 GitHub Release 后，检查更新才会返回真实结果。"
    };

    render(<AppUpdatePanel />);

    expect(screen.getByText(/还没有发布可用于自动更新的 Release 元数据/)).toBeInTheDocument();
  });
});
