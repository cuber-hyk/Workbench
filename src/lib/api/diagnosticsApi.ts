import { invoke } from "@tauri-apps/api/core";

export interface DiagnosticEnvironment {
  runtime: "desktop" | "web-preview";
  tauriAvailable: boolean;
  platform: string;
  arch: string;
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
