mod health;
mod system;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEnvironment {
    platform: &'static str,
    arch: &'static str,
}

#[tauri::command]
pub fn get_diagnostic_environment() -> DiagnosticEnvironment {
    DiagnosticEnvironment {
        platform: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

#[tauri::command]
pub fn run_diagnostic_health_check(
    tool_targets: Vec<health::HealthToolTarget>,
) -> health::DiagnosticHealthCheck {
    health::run_diagnostic_health_check(tool_targets)
}

#[tauri::command]
pub fn get_local_workspace_system_status() -> system::LocalWorkspaceSystemStatus {
    system::local_workspace_system_status()
}
