use serde::{Deserialize, Serialize};

pub(super) type SkillResult<T> = Result<T, String>;
pub(super) const UNCATEGORIZED_CATEGORY_ID: &str = "uncategorized";
pub(super) const UNCATEGORIZED_CATEGORY_NAME: &str = "未分类";
pub(super) const SKILLS_CLI_TIMEOUT_SECONDS: u64 = 180;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillMetadata {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEnablement {
    pub project_name: String,
    pub project_path: String,
    pub tool: String,
    pub sync_method: SyncMethod,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolEnablement {
    pub tool: String,
    pub sync_method: SyncMethod,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlobalToolState {
    pub tool: String,
    pub status: GlobalStatus,
    pub sync_method: Option<SyncMethod>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    pub id: String,
    pub directory_name: String,
    pub name: String,
    pub description: String,
    pub category_id: String,
    pub category: String,
    pub skill_path: String,
    pub enabled_tools: Vec<String>,
    pub enabled_tool_methods: Vec<ToolEnablement>,
    pub global_tool_states: Vec<GlobalToolState>,
    pub enabled_projects: Vec<ProjectEnablement>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolTarget {
    pub key: String,
    pub name: String,
    pub global_skills_dir: String,
    pub supports_project_scope: bool,
    pub available: bool,
    pub source: ToolTargetSource,
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolTargetSource {
    Builtin,
    Custom,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomToolTargetInput {
    pub key: Option<String>,
    pub name: String,
    pub global_skills_dir: String,
    pub icon_source_path: Option<String>,
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillsSettings {
    pub workbench_root: String,
    pub skills_root: String,
    pub previous_skills_root: Option<String>,
    pub tool_targets: Vec<ToolTarget>,
    pub close_behavior: CloseBehavior,
    pub close_tray_hint_dismissed: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloseBehavior {
    Exit,
    HideToTray,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct ToolTargetDefinition {
    pub(super) key: &'static str,
    pub(super) name: &'static str,
    pub(super) global_path: &'static [&'static str],
    pub(super) project_path: Option<&'static [&'static str]>,
}

pub(super) const TOOL_TARGET_ORDER_SETTING: &str = "tool_target_order";
pub(super) const CLOSE_BEHAVIOR_SETTING: &str = "close_behavior";
pub(super) const CLOSE_TRAY_HINT_DISMISSED_SETTING: &str = "close_tray_hint_dismissed";
pub(super) const TOOL_TARGET_DEFINITIONS: &[ToolTargetDefinition] = &[
    ToolTargetDefinition {
        key: "codex",
        name: "Codex",
        global_path: &[".codex", "skills"],
        project_path: Some(&[".codex", "skills"]),
    },
    ToolTargetDefinition {
        key: "claude",
        name: "Claude Code",
        global_path: &[".claude", "skills"],
        project_path: Some(&[".claude", "skills"]),
    },
    ToolTargetDefinition {
        key: "opencode",
        name: "OpenCode",
        global_path: &[".config", "opencode", "skills"],
        project_path: Some(&[".opencode", "skills"]),
    },
    ToolTargetDefinition {
        key: "deveco",
        name: "DevEco Code",
        global_path: &[".config", "deveco", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "hermes",
        name: "Hermes",
        global_path: &[".hermes", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "kimi",
        name: "Kimi Code",
        global_path: &[".kimi-code", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "pi",
        name: "Pi Agent",
        global_path: &[".pi", "agent", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "gemini",
        name: "Gemini CLI",
        global_path: &[".gemini", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "qwen",
        name: "Qwen Code",
        global_path: &[".qwen", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "goose",
        name: "Goose",
        global_path: &[".agents", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "kilo",
        name: "Kilo Code",
        global_path: &[".kilo", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "cline",
        name: "Cline",
        global_path: &[".cline", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "roo",
        name: "Roo Code",
        global_path: &[".roo", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "factory",
        name: "Factory Droid",
        global_path: &[".factory", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "amp",
        name: "Amp",
        global_path: &[".config", "agents", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "kiro",
        name: "Kiro CLI",
        global_path: &[".kiro", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "junie",
        name: "Junie CLI",
        global_path: &[".junie", "skills"],
        project_path: None,
    },
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillCategory {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub skill_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillsState {
    pub settings: SkillsSettings,
    pub skills: Vec<SkillRecord>,
    pub categories: Vec<SkillCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub directory_name: String,
    pub status: ImportStatus,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ImportStatus {
    Imported,
    Skipped,
    Conflict,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSkillCandidateGroup {
    pub directory_name: String,
    pub display_name: String,
    pub description: String,
    pub status: ExternalSkillCandidateStatus,
    pub sources: Vec<ExternalSkillCandidateSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSkillCandidateSource {
    pub tool: String,
    pub tool_name: String,
    pub path: String,
    pub content_hash: Option<String>,
    pub readable: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExternalSkillCandidateStatus {
    New,
    SameAsCurrent,
    Conflict,
    Invalid,
    Unreadable,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSkillImportSelection {
    pub directory_name: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillsRootMigrationState {
    pub previous_skills_root: Option<String>,
    pub current_skills_root: String,
    pub can_migrate: bool,
    pub candidates: Vec<RootSkillMigrationCandidate>,
    pub managed_targets: Vec<ManagedTargetRebuildCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RootSkillMigrationCandidate {
    pub directory_name: String,
    pub display_name: String,
    pub description: String,
    pub source_path: String,
    pub status: ExternalSkillCandidateStatus,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RootSkillMigrationSelection {
    pub directory_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedTargetRebuildCandidate {
    pub directory_name: String,
    pub tool: String,
    pub scope: String,
    pub project_name: String,
    pub project_path: String,
    pub link_path: String,
    pub sync_method: SyncMethod,
    pub status: ManagedTargetRebuildStatus,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedTargetRebuildSelection {
    pub directory_name: String,
    pub tool: String,
    pub scope: String,
    pub project_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedTargetRebuildResult {
    pub directory_name: String,
    pub tool: String,
    pub scope: String,
    pub project_path: String,
    pub status: ManagedTargetRebuildStatus,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ManagedTargetRebuildStatus {
    Ready,
    Rebuilt,
    Skipped,
    Conflict,
    Invalid,
}

#[derive(Debug, Clone)]
pub(super) struct ManagedTargetRecord {
    pub(super) directory_name: String,
    pub(super) tool: String,
    pub(super) scope: String,
    pub(super) project_name: String,
    pub(super) project_path: String,
    pub(super) link_path: String,
    pub(super) sync_method: SyncMethod,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketItem {
    pub source: String,
    pub skill_id: String,
    pub name: String,
    pub description: String,
    pub installs: i64,
    pub official: bool,
    pub installed_directory_name: Option<String>,
    pub update_status: SkillUpdateState,
    pub installable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketDetail {
    pub item: SkillMarketItem,
    pub repository_url: String,
    pub install_command: String,
    pub skill_markdown_preview: String,
    pub security_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillSourceRecord {
    pub directory_name: String,
    pub source: String,
    pub package_slug: String,
    pub repo_url: String,
    pub skill_path: String,
    pub installed_ref: String,
    pub installed_hash: String,
    pub remote_ref: String,
    pub last_checked_at: String,
    pub installed_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateStatus {
    pub source: SkillSourceRecord,
    pub name: String,
    pub description: String,
    pub status: SkillUpdateState,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillUpdateState {
    NotInstalled,
    Installed,
    UpToDate,
    UpdateAvailable,
    CheckFailed,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateResult {
    pub directory_name: String,
    pub status: SkillUpdateState,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SkillInstallProgress {
    pub(super) source: String,
    pub(super) skill_id: String,
    pub(super) progress: u8,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncMethod {
    Symlink,
    Copy,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GlobalStatus {
    Disabled,
    Managed,
    External,
    Conflict,
}

#[derive(Debug, Deserialize)]
pub(super) struct Frontmatter {
    pub(super) name: Option<String>,
    pub(super) description: Option<String>,
}
