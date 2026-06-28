use serde::Serialize;

#[derive(Serialize)]
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
