use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub note: String,
    pub tags: Vec<String>,
    pub launch_configs: Vec<ProjectLaunchConfig>,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLaunchConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    pub workdir: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProjectImportRequest {
    pub import_id: String,
    pub project_id: String,
    pub replace_project_id: Option<String>,
    pub repo_url: String,
    pub parent_directory: String,
    pub name: String,
    pub note: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProjectImportInspection {
    pub status: RemoteProjectImportStatus,
    pub target_path: String,
    pub existing_project: Option<ProjectRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RemoteProjectImportStatus {
    Ready,
    ManagedExisting,
    ManagedMissing,
    UnmanagedExisting,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImportProgress {
    pub import_id: String,
    pub progress: u8,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOpenProfile {
    pub id: String,
    pub name: String,
    pub kind: ProjectOpenProfileKind,
    pub command: String,
    pub executable_path: String,
    pub args: Vec<String>,
    pub workdir: String,
    pub enabled: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectOpenProfileKind {
    App,
    Terminal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRun {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub started_at: String,
    pub sessions: Vec<LaunchSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSession {
    pub id: String,
    pub launch_run_id: String,
    pub config_id: String,
    pub config_name: String,
    pub command: String,
    pub workdir: String,
    pub status: LaunchSessionStatus,
    pub exit_code: Option<i32>,
    pub output: Vec<LaunchOutputChunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOutputChunk {
    pub stream: LaunchOutputStream,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSessionEvent {
    pub launch_run_id: String,
    pub session_id: String,
    pub event_type: LaunchSessionEventType,
    pub stream: Option<LaunchOutputStream>,
    pub content: Option<String>,
    pub status: Option<LaunchSessionStatus>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSessionSnapshot {
    pub launch_run_id: String,
    pub session_id: String,
    pub status: LaunchSessionStatus,
    pub exit_code: Option<i32>,
    pub output: Vec<LaunchOutputChunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LaunchOutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LaunchSessionEventType {
    Output,
    Status,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LaunchSessionStatus {
    Starting,
    Running,
    Exited,
    Failed,
    Stopped,
}
