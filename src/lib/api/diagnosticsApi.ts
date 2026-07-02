import { invoke } from "@tauri-apps/api/core";
import type { ToolTarget } from "../types/domain";

export interface DiagnosticEnvironment {
  runtime: "desktop" | "web-preview";
  tauriAvailable: boolean;
  platform: string;
  arch: string;
}

export type DiagnosticHealthStatus = "ready" | "missing" | "needs_config" | "no_permission" | "failed" | "skipped";

export interface DiagnosticHealthItem {
  key: string;
  name: string;
  status: DiagnosticHealthStatus;
  message: string;
  detail: string;
}

export interface DiagnosticHealthCheck {
  checkedAt: string;
  items: DiagnosticHealthItem[];
}

export interface LocalWorkspaceSystemStatus {
  memory: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
  };
}

const isTauri = "__TAURI_INTERNALS__" in window;

export async function getDiagnosticEnvironment(): Promise<DiagnosticEnvironment> {
  if (!isTauri) return webPreviewEnvironment();
  try {
    const environment = await invoke<Omit<DiagnosticEnvironment, "runtime" | "tauriAvailable">>("get_diagnostic_environment");
    return {
      ...environment,
      runtime: "desktop",
      tauriAvailable: true
    };
  } catch {
    return webPreviewEnvironment();
  }
}

function webPreviewEnvironment(): DiagnosticEnvironment {
  return {
    runtime: "web-preview",
    tauriAvailable: false,
    platform: "browser",
    arch: "unknown"
  };
}

export async function runDiagnosticHealthCheck(toolTargets: ToolTarget[]): Promise<DiagnosticHealthCheck> {
  if (!isTauri) return webPreviewHealthCheck(toolTargets);
  return invoke<DiagnosticHealthCheck>("run_diagnostic_health_check", {
    toolTargets: toolTargets.map((tool) => ({
      key: tool.key,
      name: tool.name,
      globalSkillsDir: tool.globalSkillsDir
    }))
  });
}

export async function getLocalWorkspaceSystemStatus(): Promise<LocalWorkspaceSystemStatus> {
  if (!isTauri) return webPreviewSystemStatus();
  try {
    return await invoke<LocalWorkspaceSystemStatus>("get_local_workspace_system_status");
  } catch {
    return unavailableSystemStatus();
  }
}

function webPreviewHealthCheck(toolTargets: ToolTarget[]): DiagnosticHealthCheck {
  return {
    checkedAt: String(Date.now()),
    items: [
      {
        key: "web-preview",
        name: "健康检查",
        status: "skipped",
        message: "健康检查仅在 Tauri 桌面应用中运行。",
        detail: `预览模式不会执行外部命令或检查 ${toolTargets.length} 个工具目录。`
      }
    ]
  };
}

function webPreviewSystemStatus(): LocalWorkspaceSystemStatus {
  return {
    memory: {
      totalBytes: 16 * 1024 ** 3,
      usedBytes: Math.round(6.2 * 1024 ** 3),
      availableBytes: Math.round(9.8 * 1024 ** 3)
    }
  };
}

function unavailableSystemStatus(): LocalWorkspaceSystemStatus {
  return {
    memory: {
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0
    }
  };
}
