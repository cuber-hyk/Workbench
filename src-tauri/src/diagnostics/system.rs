use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWorkspaceSystemStatus {
    memory: MemoryStatus,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStatus {
    total_bytes: u64,
    used_bytes: u64,
    available_bytes: u64,
}

pub fn local_workspace_system_status() -> LocalWorkspaceSystemStatus {
    let mut system = System::new();
    system.refresh_memory();
    let total_memory = system.total_memory();
    let available_memory = system.available_memory();

    LocalWorkspaceSystemStatus {
        memory: MemoryStatus {
            total_bytes: total_memory,
            used_bytes: total_memory.saturating_sub(available_memory),
            available_bytes: available_memory,
        },
    }
}
