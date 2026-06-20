use regex::Regex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;
use tempfile::tempdir;
use walkdir::WalkDir;
use zip::ZipArchive;

type SkillResult<T> = Result<T, String>;
const UNCATEGORIZED_CATEGORY_ID: &str = "uncategorized";
const UNCATEGORIZED_CATEGORY_NAME: &str = "未分类";
const SKILLS_CLI_TIMEOUT_SECONDS: u64 = 180;

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
struct ToolTargetDefinition {
    key: &'static str,
    name: &'static str,
    global_path: &'static [&'static str],
    project_path: Option<&'static [&'static str]>,
}

const TOOL_TARGET_ORDER_SETTING: &str = "tool_target_order";
const CLOSE_BEHAVIOR_SETTING: &str = "close_behavior";
const CLOSE_TRAY_HINT_DISMISSED_SETTING: &str = "close_tray_hint_dismissed";
const TOOL_TARGET_DEFINITIONS: &[ToolTargetDefinition] = &[
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
    Conflict,
    Invalid,
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
struct SkillInstallProgress {
    source: String,
    skill_id: String,
    progress: u8,
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
struct Frontmatter {
    name: Option<String>,
    description: Option<String>,
}

pub fn parse_skill_markdown(markdown: &str, fallback: &str) -> SkillMetadata {
    let normalized = markdown.replace("\r\n", "\n");
    let frontmatter = normalized
        .strip_prefix("---\n")
        .and_then(|body| body.split_once("\n---"))
        .and_then(|(yaml, _)| serde_yaml::from_str::<Frontmatter>(yaml).ok());

    SkillMetadata {
        name: frontmatter
            .as_ref()
            .and_then(|value| value.name.clone())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| fallback.to_string()),
        description: frontmatter
            .and_then(|value| value.description)
            .unwrap_or_default(),
    }
}

pub fn scan_skill_directories(root: &Path) -> SkillResult<Vec<SkillRecord>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();
    for entry in fs::read_dir(root).map_err(error_message)? {
        let entry = entry.map_err(error_message)?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_path = path.join("SKILL.md");
        if !skill_path.is_file() {
            continue;
        }

        let directory_name = entry.file_name().to_string_lossy().to_string();
        let markdown = fs::read_to_string(&skill_path).map_err(error_message)?;
        let metadata = parse_skill_markdown(&markdown, &directory_name);
        skills.push(SkillRecord {
            id: directory_name.clone(),
            directory_name,
            name: metadata.name,
            description: metadata.description,
            category_id: UNCATEGORIZED_CATEGORY_ID.to_string(),
            category: UNCATEGORIZED_CATEGORY_NAME.to_string(),
            skill_path: skill_path.to_string_lossy().to_string(),
            enabled_tools: Vec::new(),
            enabled_tool_methods: Vec::new(),
            global_tool_states: Vec::new(),
            enabled_projects: Vec::new(),
        });
    }
    skills.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(skills)
}

pub fn import_skill_directory(source: &Path, target_root: &Path) -> SkillResult<ImportResult> {
    let directory_name = source
        .file_name()
        .ok_or_else(|| "导入来源没有目录名称".to_string())?
        .to_string_lossy()
        .to_string();

    if !source.join("SKILL.md").is_file() {
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Invalid,
            message: "目录中不存在 SKILL.md".to_string(),
        });
    }
    validate_directory_name(&directory_name)?;

    fs::create_dir_all(target_root).map_err(error_message)?;
    let target = target_root.join(&directory_name);
    if target.exists() || target.symlink_metadata().is_ok() {
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Conflict,
            message: "统一根目录中已存在同名 Skill".to_string(),
        });
    }

    let temporary = tempfile::tempdir_in(target_root).map_err(error_message)?;
    let staged = temporary.path().join(&directory_name);
    copy_directory(source, &staged)?;
    fs::rename(staged, &target).map_err(error_message)?;
    Ok(ImportResult {
        directory_name,
        status: ImportStatus::Imported,
        message: "导入成功".to_string(),
    })
}

fn copy_directory(source: &Path, target: &Path) -> SkillResult<()> {
    for entry in WalkDir::new(source).follow_links(true) {
        let entry = entry.map_err(error_message)?;
        let path = entry.path();
        let relative = path.strip_prefix(source).map_err(error_message)?;
        if relative.components().any(|part| part.as_os_str() == ".git") {
            continue;
        }
        let destination = target.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination).map_err(error_message)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(error_message)?;
            }
            fs::copy(path, destination).map_err(error_message)?;
        }
    }
    Ok(())
}

fn directories_match(left: &Path, right: &Path) -> SkillResult<bool> {
    let collect = |root: &Path| -> SkillResult<Vec<(PathBuf, Vec<u8>)>> {
        let mut files = Vec::new();
        for entry in WalkDir::new(root).follow_links(true) {
            let entry = entry.map_err(error_message)?;
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry.path().strip_prefix(root).map_err(error_message)?;
            if relative.components().any(|part| part.as_os_str() == ".git") {
                continue;
            }
            files.push((
                relative.to_path_buf(),
                fs::read(entry.path()).map_err(error_message)?,
            ));
        }
        files.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(files)
    };
    Ok(collect(left)? == collect(right)?)
}

fn detect_external_status(source: &Path, target: &Path) -> SkillResult<GlobalStatus> {
    let Ok(metadata) = target.symlink_metadata() else {
        return Ok(GlobalStatus::Disabled);
    };
    if metadata.file_type().is_symlink() {
        return Ok(if symlink_points_to(source, target) {
            GlobalStatus::External
        } else {
            GlobalStatus::Conflict
        });
    }
    if target.is_dir() && directories_match(source, target)? {
        return Ok(GlobalStatus::External);
    }
    Ok(GlobalStatus::Conflict)
}

#[cfg(unix)]
fn create_directory_symlink(source: &Path, target: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}

#[cfg(windows)]
fn create_directory_symlink(source: &Path, target: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_dir(source, target)
}

fn symlink_points_to(source: &Path, target: &Path) -> bool {
    let Ok(metadata) = target.symlink_metadata() else {
        return false;
    };
    if !metadata.file_type().is_symlink() {
        return false;
    }
    let Ok(link_target) = fs::read_link(target) else {
        return false;
    };
    let resolved = if link_target.is_absolute() {
        link_target
    } else {
        target
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .join(link_target)
    };
    resolved.canonicalize().ok() == source.canonicalize().ok()
}

pub fn remove_managed_symlink(source: &Path, target: &Path) -> SkillResult<()> {
    if !symlink_points_to(source, target) {
        return Err("目标不是由 Workbench 管理的符号链接".to_string());
    }
    #[cfg(windows)]
    fs::remove_dir(target).map_err(error_message)?;
    #[cfg(unix)]
    fs::remove_file(target).map_err(error_message)?;
    Ok(())
}

fn sync_directory_auto_with<F>(
    source: &Path,
    target: &Path,
    create_symlink: F,
) -> SkillResult<SyncMethod>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    match create_symlink(source, target) {
        Ok(()) => Ok(SyncMethod::Symlink),
        Err(_) => {
            copy_to_new_target(source, target)?;
            Ok(SyncMethod::Copy)
        }
    }
}

fn copy_to_new_target(source: &Path, target: &Path) -> SkillResult<()> {
    let parent = target
        .parent()
        .ok_or_else(|| "同步目标路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(error_message)?;
    let temporary = tempfile::tempdir_in(parent).map_err(error_message)?;
    let staged = temporary.path().join("skill");
    copy_directory(source, &staged)?;
    fs::rename(staged, target).map_err(error_message)
}

fn replace_directory_from(source: &Path, target: &Path) -> SkillResult<()> {
    let parent = target
        .parent()
        .ok_or_else(|| "替换目标路径无效".to_string())?;
    let temporary = tempfile::tempdir_in(parent).map_err(error_message)?;
    let staged = temporary.path().join("replacement");
    copy_directory(source, &staged)?;
    remove_existing_target(target)?;
    fs::rename(staged, target).map_err(error_message)
}

fn remove_existing_target(target: &Path) -> SkillResult<()> {
    let Ok(metadata) = target.symlink_metadata() else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        #[cfg(windows)]
        fs::remove_dir(target).map_err(error_message)?;
        #[cfg(unix)]
        fs::remove_file(target).map_err(error_message)?;
    } else if metadata.is_dir() {
        fs::remove_dir_all(target).map_err(error_message)?;
    } else {
        fs::remove_file(target).map_err(error_message)?;
    }
    Ok(())
}

fn remove_managed_target(source: &Path, target: &Path, method: SyncMethod) -> SkillResult<()> {
    match method {
        SyncMethod::Symlink => remove_managed_symlink(source, target),
        SyncMethod::Copy => {
            if target == source || target.symlink_metadata().is_err() || !target.is_dir() {
                return Err("受管 Copy 目标无效".to_string());
            }
            fs::remove_dir_all(target).map_err(error_message)
        }
    }
}

fn managed_target_is_active(source: &Path, target: &Path, method: SyncMethod) -> bool {
    match method {
        SyncMethod::Symlink => symlink_points_to(source, target),
        SyncMethod::Copy => {
            target.is_dir()
                && target
                    .symlink_metadata()
                    .map(|metadata| !metadata.file_type().is_symlink())
                    .unwrap_or(false)
        }
    }
}

fn default_workbench_root() -> SkillResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".workbench"))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}

fn database_path(workbench_root: &Path) -> PathBuf {
    workbench_root.join("workbench.sqlite")
}

fn open_database(workbench_root: &Path) -> SkillResult<Connection> {
    fs::create_dir_all(workbench_root).map_err(error_message)?;
    let connection = Connection::open(database_path(workbench_root)).map_err(error_message)?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS skill_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS skill_enablements (
                directory_name TEXT NOT NULL,
                tool TEXT NOT NULL,
                scope TEXT NOT NULL,
                project_name TEXT NOT NULL DEFAULT '',
                project_path TEXT NOT NULL DEFAULT '',
                link_path TEXT NOT NULL,
                sync_method TEXT NOT NULL DEFAULT 'symlink',
                PRIMARY KEY(directory_name, tool, scope, project_path)
            );
            CREATE TABLE IF NOT EXISTS custom_tool_targets (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                global_skills_dir TEXT NOT NULL,
                icon_path TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ",
        )
        .map_err(error_message)?;
    ensure_skill_category_schema(&connection)?;
    ensure_skill_source_schema(&connection)?;
    let has_sync_method = connection
        .prepare("PRAGMA table_info(skill_enablements)")
        .map_err(error_message)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(error_message)?
        .filter_map(Result::ok)
        .any(|column| column == "sync_method");
    if !has_sync_method {
        connection
            .execute(
                "ALTER TABLE skill_enablements ADD COLUMN sync_method TEXT NOT NULL DEFAULT 'symlink'",
                [],
            )
            .map_err(error_message)?;
    }
    Ok(connection)
}

fn ensure_skill_source_schema(connection: &Connection) -> SkillResult<()> {
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS skill_sources (
                directory_name TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                package_slug TEXT NOT NULL,
                repo_url TEXT NOT NULL,
                skill_path TEXT NOT NULL,
                installed_ref TEXT NOT NULL,
                installed_hash TEXT NOT NULL,
                remote_ref TEXT NOT NULL,
                last_checked_at TEXT NOT NULL DEFAULT '',
                installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .map_err(error_message)?;
    Ok(())
}

fn ensure_skill_category_schema(connection: &Connection) -> SkillResult<()> {
    ensure_category_exists(
        connection,
        UNCATEGORIZED_CATEGORY_ID,
        UNCATEGORIZED_CATEGORY_NAME,
    )?;
    let metadata_exists = table_exists(connection, "skill_metadata")?;
    if !metadata_exists {
        connection
            .execute(
                "CREATE TABLE skill_metadata (
                    directory_name TEXT PRIMARY KEY,
                    category_id TEXT NOT NULL DEFAULT 'uncategorized',
                    FOREIGN KEY(category_id) REFERENCES skill_categories(id)
                )",
                [],
            )
            .map_err(error_message)?;
        return Ok(());
    }

    if table_has_column(connection, "skill_metadata", "category_id")? {
        return Ok(());
    }

    let rows = {
        let mut statement = connection
            .prepare("SELECT directory_name, category FROM skill_metadata")
            .map_err(error_message)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(error_message)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error_message)?;
        rows
    };

    let mut seen_categories = HashSet::new();
    for (_, category_name) in &rows {
        let normalized = normalize_category_name(category_name);
        if seen_categories.insert(normalized.clone()) {
            let id = category_id_for_name(&normalized);
            ensure_category_exists(connection, &id, &normalized)?;
        }
    }

    connection
        .execute_batch(
            "
            CREATE TABLE skill_metadata_new (
                directory_name TEXT PRIMARY KEY,
                category_id TEXT NOT NULL DEFAULT 'uncategorized',
                FOREIGN KEY(category_id) REFERENCES skill_categories(id)
            );
            ",
        )
        .map_err(error_message)?;
    for (directory_name, category_name) in rows {
        let normalized = normalize_category_name(&category_name);
        let category_id = category_id_for_name(&normalized);
        connection
            .execute(
                "INSERT INTO skill_metadata_new(directory_name, category_id) VALUES(?1, ?2)",
                params![directory_name, category_id],
            )
            .map_err(error_message)?;
    }
    connection
        .execute_batch(
            "
            DROP TABLE skill_metadata;
            ALTER TABLE skill_metadata_new RENAME TO skill_metadata;
            ",
        )
        .map_err(error_message)?;
    Ok(())
}

fn table_exists(connection: &Connection, table: &str) -> SkillResult<bool> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |_| Ok(()),
        )
        .is_ok();
    Ok(exists)
}

fn table_has_column(connection: &Connection, table: &str, column: &str) -> SkillResult<bool> {
    Ok(connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(error_message)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(error_message)?
        .filter_map(Result::ok)
        .any(|value| value == column))
}

fn normalize_category_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        UNCATEGORIZED_CATEGORY_NAME.to_string()
    } else {
        trimmed.to_string()
    }
}

fn category_id_for_name(name: &str) -> String {
    if name == UNCATEGORIZED_CATEGORY_NAME {
        return UNCATEGORIZED_CATEGORY_ID.to_string();
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    name.hash(&mut hasher);
    format!("category-{:016x}", hasher.finish())
}

fn ensure_category_exists(connection: &Connection, id: &str, name: &str) -> SkillResult<()> {
    connection
        .execute(
            "INSERT INTO skill_categories(id, name, sort_order)
             VALUES(?1, ?2, COALESCE((SELECT MAX(sort_order) + 1 FROM skill_categories), 0))
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP",
            params![id, name],
        )
        .map_err(error_message)?;
    Ok(())
}

fn configured_skills_root(connection: &Connection, workbench_root: &Path) -> SkillResult<PathBuf> {
    let configured = connection.query_row(
        "SELECT value FROM app_settings WHERE key = 'skills_root'",
        [],
        |row| row.get::<_, String>(0),
    );
    match configured {
        Ok(path) => Ok(PathBuf::from(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(workbench_root.join("skills")),
        Err(error) => Err(error.to_string()),
    }
}

fn tool_target_path(tool: &str, project_path: Option<&str>) -> SkillResult<PathBuf> {
    if let Ok(definition) = builtin_tool_target_definition(tool) {
        let base = match project_path {
            Some(path) => PathBuf::from(path),
            None => dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?,
        };
        let segments = match project_path {
            Some(_) => definition
                .project_path
                .ok_or_else(|| format!("工具不支持项目级 Skills: {}", definition.name))?,
            None => definition.global_path,
        };
        return Ok(join_path_segments(base, segments));
    }

    if project_path.is_some() {
        return Err(format!("工具不支持项目级 Skills: {tool}"));
    }
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    custom_tool_target_path(&connection, tool)
}

fn tool_targets(connection: &Connection) -> SkillResult<Vec<ToolTarget>> {
    let mut targets = TOOL_TARGET_DEFINITIONS
        .iter()
        .map(target_definition)
        .collect::<SkillResult<Vec<_>>>()?;
    targets.extend(custom_tool_targets(connection)?);
    Ok(targets)
}

fn ordered_tool_targets(connection: &Connection) -> SkillResult<Vec<ToolTarget>> {
    let mut targets = tool_targets(connection)?;
    let configured_order = configured_tool_target_order(connection)?;
    if configured_order.is_empty() {
        return Ok(targets);
    }
    targets.sort_by_key(|target| {
        configured_order
            .iter()
            .position(|key| key == &target.key)
            .unwrap_or(configured_order.len() + default_tool_target_index(&target.key))
    });
    Ok(targets)
}

fn configured_tool_target_order(connection: &Connection) -> SkillResult<Vec<String>> {
    let configured = connection.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [TOOL_TARGET_ORDER_SETTING],
        |row| row.get::<_, String>(0),
    );
    match configured {
        Ok(value) => {
            let allowed = available_tool_target_keys(connection)?;
            let order: Vec<String> = serde_json::from_str(&value).map_err(error_message)?;
            Ok(order
                .into_iter()
                .filter(|key| allowed.contains(key))
                .collect())
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

fn configured_close_behavior(connection: &Connection) -> SkillResult<CloseBehavior> {
    let configured = connection.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [CLOSE_BEHAVIOR_SETTING],
        |row| row.get::<_, String>(0),
    );
    match configured {
        Ok(value) => match value.as_str() {
            "\"exit\"" => Ok(CloseBehavior::Exit),
            "\"hide_to_tray\"" | "\"ask\"" => Ok(CloseBehavior::HideToTray),
            _ => serde_json::from_str(&value).map_err(error_message),
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(CloseBehavior::HideToTray),
        Err(error) => Err(error.to_string()),
    }
}

fn configured_bool_setting(
    connection: &Connection,
    key: &str,
    default_value: bool,
) -> SkillResult<bool> {
    let configured = connection.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    );
    match configured {
        Ok(value) => serde_json::from_str(&value).map_err(error_message),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(default_value),
        Err(error) => Err(error.to_string()),
    }
}

fn default_tool_target_index(key: &str) -> usize {
    TOOL_TARGET_DEFINITIONS
        .iter()
        .position(|definition| definition.key == key)
        .unwrap_or(TOOL_TARGET_DEFINITIONS.len())
}

fn builtin_tool_target_definition(key: &str) -> SkillResult<&'static ToolTargetDefinition> {
    TOOL_TARGET_DEFINITIONS
        .iter()
        .find(|definition| definition.key == key)
        .ok_or_else(|| format!("不支持的工具: {key}"))
}

fn available_tool_target_keys(connection: &Connection) -> SkillResult<HashSet<String>> {
    Ok(tool_targets(connection)?
        .into_iter()
        .map(|target| target.key)
        .collect())
}

fn join_path_segments(mut base: PathBuf, segments: &[&str]) -> PathBuf {
    for segment in segments {
        base = base.join(segment);
    }
    base
}

fn target_definition(definition: &ToolTargetDefinition) -> SkillResult<ToolTarget> {
    let path = tool_target_path(definition.key, None)?;
    Ok(ToolTarget {
        key: definition.key.to_string(),
        name: definition.name.to_string(),
        global_skills_dir: path.to_string_lossy().to_string(),
        supports_project_scope: definition.project_path.is_some(),
        available: path.exists(),
        source: ToolTargetSource::Builtin,
        icon_path: None,
    })
}

fn custom_tool_targets(connection: &Connection) -> SkillResult<Vec<ToolTarget>> {
    let mut statement = connection
        .prepare(
            "SELECT key, name, global_skills_dir, icon_path
             FROM custom_tool_targets
             ORDER BY created_at, name",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let path = row.get::<_, String>(2)?;
            let icon_path = row.get::<_, String>(3)?;
            Ok(ToolTarget {
                key: row.get(0)?,
                name: row.get(1)?,
                available: PathBuf::from(&path).exists(),
                global_skills_dir: path,
                supports_project_scope: false,
                source: ToolTargetSource::Custom,
                icon_path: if icon_path.trim().is_empty() {
                    None
                } else {
                    Some(icon_path)
                },
            })
        })
        .map_err(error_message)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(error_message)
}

fn custom_tool_target_path(connection: &Connection, key: &str) -> SkillResult<PathBuf> {
    connection
        .query_row(
            "SELECT global_skills_dir FROM custom_tool_targets WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .map(PathBuf::from)
        .map_err(|_| format!("不支持的工具: {key}"))
}

fn current_settings() -> SkillResult<SkillsSettings> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let skills_root = configured_skills_root(&connection, &workbench_root)?;
    fs::create_dir_all(&skills_root).map_err(error_message)?;
    Ok(SkillsSettings {
        workbench_root: workbench_root.to_string_lossy().to_string(),
        skills_root: skills_root.to_string_lossy().to_string(),
        tool_targets: ordered_tool_targets(&connection)?,
        close_behavior: configured_close_behavior(&connection)?,
        close_tray_hint_dismissed: configured_bool_setting(
            &connection,
            CLOSE_TRAY_HINT_DISMISSED_SETTING,
            false,
        )?,
    })
}

fn enrich_skills(
    connection: &Connection,
    mut skills: Vec<SkillRecord>,
) -> SkillResult<Vec<SkillRecord>> {
    for skill in &mut skills {
        let category = connection
            .query_row(
                "SELECT skill_categories.id, skill_categories.name
                 FROM skill_metadata
                 JOIN skill_categories ON skill_metadata.category_id = skill_categories.id
                 WHERE skill_metadata.directory_name = ?1",
                [&skill.directory_name],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .unwrap_or_else(|_| {
                (
                    UNCATEGORIZED_CATEGORY_ID.to_string(),
                    UNCATEGORIZED_CATEGORY_NAME.to_string(),
                )
            });
        skill.category_id = category.0;
        skill.category = category.1;

        let mut statement = connection
            .prepare(
                "SELECT tool, scope, project_name, project_path, link_path, sync_method
                 FROM skill_enablements WHERE directory_name = ?1",
            )
            .map_err(error_message)?;
        let rows = statement
            .query_map([&skill.directory_name], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(error_message)?;

        let source = PathBuf::from(&skill.skill_path)
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Skill 路径无效".to_string())?;
        for row in rows {
            let (tool, scope, project_name, project_path, link_path, sync_method) =
                row.map_err(error_message)?;
            let sync_method = parse_sync_method(&sync_method)?;
            let target = Path::new(&link_path);
            if !managed_target_is_active(&source, target, sync_method) {
                continue;
            }
            if scope == "global" {
                skill.enabled_tools.push(tool.clone());
                skill
                    .enabled_tool_methods
                    .push(ToolEnablement { tool, sync_method });
            } else {
                skill.enabled_projects.push(ProjectEnablement {
                    project_name,
                    project_path,
                    tool,
                    sync_method,
                });
            }
        }
        for target in tool_targets(connection)? {
            let managed = skill
                .enabled_tool_methods
                .iter()
                .find(|entry| entry.tool == target.key);
            if let Some(enablement) = managed {
                skill.global_tool_states.push(GlobalToolState {
                    tool: target.key,
                    status: GlobalStatus::Managed,
                    sync_method: Some(enablement.sync_method),
                });
                continue;
            }
            let target_path = PathBuf::from(target.global_skills_dir).join(&skill.directory_name);
            let external_status = detect_external_status(&source, &target_path)?;
            if external_status == GlobalStatus::External {
                let sync_method = if symlink_points_to(&source, &target_path) {
                    SyncMethod::Symlink
                } else {
                    SyncMethod::Copy
                };
                save_global_enablement(
                    connection,
                    &skill.directory_name,
                    &target.key,
                    &target_path,
                    sync_method,
                )?;
                skill.enabled_tools.push(target.key.clone());
                skill.enabled_tool_methods.push(ToolEnablement {
                    tool: target.key.clone(),
                    sync_method,
                });
                skill.global_tool_states.push(GlobalToolState {
                    tool: target.key,
                    status: GlobalStatus::Managed,
                    sync_method: Some(sync_method),
                });
                continue;
            }
            skill.global_tool_states.push(GlobalToolState {
                tool: target.key,
                status: external_status,
                sync_method: None,
            });
        }
    }
    Ok(skills)
}

fn list_skill_categories(connection: &Connection) -> SkillResult<Vec<SkillCategory>> {
    let mut statement = connection
        .prepare(
            "SELECT skill_categories.id,
                    skill_categories.name,
                    skill_categories.sort_order,
                    COUNT(skill_metadata.directory_name) AS skill_count
             FROM skill_categories
             LEFT JOIN skill_metadata ON skill_metadata.category_id = skill_categories.id
             GROUP BY skill_categories.id, skill_categories.name, skill_categories.sort_order
             ORDER BY skill_categories.sort_order, skill_categories.name",
        )
        .map_err(error_message)?;
    let categories = statement
        .query_map([], |row| {
            Ok(SkillCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                skill_count: row.get(3)?,
            })
        })
        .map_err(error_message)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error_message)?;
    Ok(categories)
}

fn require_category(connection: &Connection, category_id: &str) -> SkillResult<SkillCategory> {
    connection
        .query_row(
            "SELECT id, name, sort_order FROM skill_categories WHERE id = ?1",
            [category_id],
            |row| {
                Ok(SkillCategory {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sort_order: row.get(2)?,
                    skill_count: 0,
                })
            },
        )
        .map_err(|_| "分类不存在".to_string())
}

fn save_global_enablement(
    connection: &Connection,
    directory_name: &str,
    tool: &str,
    target: &Path,
    sync_method: SyncMethod,
) -> SkillResult<()> {
    connection
        .execute(
            "INSERT INTO skill_enablements(directory_name, tool, scope, project_name, project_path, link_path, sync_method)
             VALUES(?1, ?2, 'global', '', '', ?3, ?4)
             ON CONFLICT(directory_name, tool, scope, project_path)
             DO UPDATE SET link_path = excluded.link_path, sync_method = excluded.sync_method",
            params![
                directory_name,
                tool,
                target.to_string_lossy().to_string(),
                sync_method_name(sync_method)
            ],
        )
        .map_err(error_message)?;
    Ok(())
}

fn backup_path(workbench_root: &Path, tool: &str, directory_name: &str) -> SkillResult<PathBuf> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error_message)?;
    let timestamp = format!("{}-{:03}", elapsed.as_secs(), elapsed.subsec_millis());
    Ok(workbench_root
        .join("backups")
        .join("skills")
        .join(timestamp)
        .join(tool)
        .join(directory_name))
}

fn copy_path_to_backup(source: &Path, backup: &Path) -> SkillResult<()> {
    let metadata = source.symlink_metadata().map_err(error_message)?;
    if metadata.is_dir() || metadata.file_type().is_symlink() {
        copy_directory(source, backup)?;
        return Ok(());
    }
    if let Some(parent) = backup.parent() {
        fs::create_dir_all(parent).map_err(error_message)?;
    }
    fs::copy(source, backup).map_err(error_message)?;
    Ok(())
}

fn refresh_managed_copies(
    connection: &Connection,
    source: &Path,
    directory_name: &str,
    excluded_path: &Path,
) -> SkillResult<()> {
    let mut statement = connection
        .prepare(
            "SELECT tool, link_path, sync_method FROM skill_enablements
             WHERE directory_name = ?1",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([directory_name], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(error_message)?;
    for row in rows {
        let (_tool, link_path, method) = row.map_err(error_message)?;
        let target = Path::new(&link_path);
        if target == excluded_path || parse_sync_method(&method)? != SyncMethod::Copy {
            continue;
        }
        replace_directory_from(source, target)?;
    }
    Ok(())
}

fn existing_global_targets(directory_name: &str) -> SkillResult<Vec<(String, PathBuf)>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    tool_targets(&connection)?
        .into_iter()
        .map(|target| {
            Ok((
                target.key,
                PathBuf::from(target.global_skills_dir).join(directory_name),
            ))
        })
        .filter_map(|result: SkillResult<(String, PathBuf)>| match result {
            Ok((tool, path)) if path.symlink_metadata().is_ok() => Some(Ok((tool, path))),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect()
}

fn skill_version_source_path(
    settings: &SkillsSettings,
    directory_name: &str,
    source: &str,
) -> SkillResult<PathBuf> {
    if source == "workbench" {
        return Ok(PathBuf::from(&settings.skills_root).join(directory_name));
    }
    tool_target_path(source, None).map(|path| path.join(directory_name))
}

fn sync_existing_global_targets(
    connection: &Connection,
    workbench_root: &Path,
    source: &Path,
    directory_name: &str,
) -> SkillResult<()> {
    for (tool, target) in existing_global_targets(directory_name)? {
        copy_path_to_backup(
            &target,
            &backup_path(workbench_root, &tool, directory_name)?,
        )?;
        remove_existing_target(&target)?;
        let method = sync_directory_auto_with(source, &target, create_directory_symlink)?;
        save_global_enablement(connection, directory_name, &tool, &target, method)?;
    }
    refresh_managed_copies(connection, source, directory_name, Path::new(""))
}

#[tauri::command]
pub fn resolve_skill_conflict(directory_name: String, source: String) -> SkillResult<SkillsState> {
    validate_directory_name(&directory_name)?;
    let settings = current_settings()?;
    let workbench_source = PathBuf::from(&settings.skills_root).join(&directory_name);
    if !workbench_source.join("SKILL.md").is_file() {
        return Err("统一根目录中不存在该 Skill".to_string());
    }
    let has_conflict = existing_global_targets(&directory_name)?
        .into_iter()
        .map(|(_, target)| detect_external_status(&workbench_source, &target))
        .collect::<SkillResult<Vec<_>>>()?
        .into_iter()
        .any(|status| status == GlobalStatus::Conflict);
    if !has_conflict {
        return Err("该 Skill 当前不存在全局版本冲突".to_string());
    }
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let selected_source = skill_version_source_path(&settings, &directory_name, &source)?;
    if !selected_source.join("SKILL.md").is_file() {
        return Err("选择的版本源不可用".to_string());
    }

    let connection = open_database(&workbench_root)?;
    if source != "workbench" {
        copy_path_to_backup(
            &workbench_source,
            &backup_path(&workbench_root, "workbench", &directory_name)?,
        )?;
        replace_directory_from(&selected_source, &workbench_source)?;
    }
    sync_existing_global_targets(
        &connection,
        &workbench_root,
        &workbench_source,
        &directory_name,
    )?;
    get_skills_state()
}

#[tauri::command]
pub fn delete_skill(directory_name: String) -> SkillResult<SkillsState> {
    validate_directory_name(&directory_name)?;
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let source = PathBuf::from(&settings.skills_root).join(&directory_name);
    if !source.join("SKILL.md").is_file() {
        return Err("统一根目录中不存在该 Skill".to_string());
    }
    let connection = open_database(&workbench_root)?;
    delete_skill_in(&connection, &source, &directory_name)?;
    get_skills_state()
}

fn delete_skill_in(
    connection: &Connection,
    source: &Path,
    directory_name: &str,
) -> SkillResult<()> {
    let mut statement = connection
        .prepare(
            "SELECT link_path, sync_method FROM skill_enablements
             WHERE directory_name = ?1",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([&directory_name], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(error_message)?;
    for row in rows {
        let (link_path, method) = row.map_err(error_message)?;
        let target = Path::new(&link_path);
        let method = parse_sync_method(&method)?;
        if managed_target_is_active(source, target, method) {
            remove_managed_target(source, target, method)?;
        }
    }
    connection
        .execute(
            "DELETE FROM skill_enablements WHERE directory_name = ?1",
            [&directory_name],
        )
        .map_err(error_message)?;
    connection
        .execute(
            "DELETE FROM skill_metadata WHERE directory_name = ?1",
            [&directory_name],
        )
        .map_err(error_message)?;
    connection
        .execute(
            "DELETE FROM skill_sources WHERE directory_name = ?1",
            [&directory_name],
        )
        .map_err(error_message)?;
    remove_existing_target(source)?;
    Ok(())
}

#[tauri::command]
pub async fn select_skill_import_source<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    kind: String,
) -> SkillResult<Option<String>> {
    let dialog = app.dialog().file();
    let result = match kind.as_str() {
        "zip" => dialog.add_filter("ZIP", &["zip"]).blocking_pick_file(),
        "folder" => dialog.blocking_pick_folder(),
        _ => return Err("不支持的导入来源类型".to_string()),
    };
    Ok(result.map(|path| path.to_string()))
}

#[tauri::command]
pub fn open_global_skill_target(directory_name: String, tool: String) -> SkillResult<()> {
    validate_directory_name(&directory_name)?;
    open_local_path(
        tool_target_path(&tool, None)?
            .join(directory_name)
            .to_string_lossy()
            .to_string(),
    )
}

#[tauri::command]
pub fn open_skill_source_directory(directory_name: String) -> SkillResult<()> {
    validate_directory_name(&directory_name)?;
    let settings = current_settings()?;
    open_local_path(
        PathBuf::from(settings.skills_root)
            .join(directory_name)
            .to_string_lossy()
            .to_string(),
    )
}

#[tauri::command]
pub fn get_skills_state() -> SkillResult<SkillsState> {
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    let skills = scan_skill_directories(Path::new(&settings.skills_root))?;
    Ok(SkillsState {
        settings,
        skills: enrich_skills(&connection, skills)?,
        categories: list_skill_categories(&connection)?,
    })
}

#[tauri::command]
pub fn set_skills_root(path: String) -> SkillResult<SkillsState> {
    let root = PathBuf::from(path);
    fs::create_dir_all(&root).map_err(error_message)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES('skills_root', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [root.to_string_lossy().to_string()],
        )
        .map_err(error_message)?;
    get_skills_state()
}

#[tauri::command]
pub fn set_close_behavior(close_behavior: CloseBehavior) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let behavior_json = serde_json::to_string(&close_behavior).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![CLOSE_BEHAVIOR_SETTING, behavior_json],
        )
        .map_err(error_message)?;
    get_skills_state()
}

#[tauri::command]
pub fn set_close_tray_hint_dismissed(dismissed: bool) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let dismissed_json = serde_json::to_string(&dismissed).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![CLOSE_TRAY_HINT_DISMISSED_SETTING, dismissed_json],
        )
        .map_err(error_message)?;
    get_skills_state()
}

fn validate_custom_tool_key(key: &str) -> SkillResult<String> {
    let trimmed = key.trim();
    if trimmed.len() < 2 || trimmed.len() > 40 {
        return Err("工具 Key 长度需为 2 到 40 个字符".to_string());
    }
    if builtin_tool_target_definition(trimmed).is_ok() {
        return Err("工具 Key 已被内置工具占用".to_string());
    }
    let first = trimmed
        .chars()
        .next()
        .ok_or_else(|| "工具 Key 不能为空".to_string())?;
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err("工具 Key 必须以小写字母或数字开头".to_string());
    }
    if !trimmed.chars().all(|value| {
        value.is_ascii_lowercase() || value.is_ascii_digit() || value == '-' || value == '_'
    }) {
        return Err("工具 Key 仅支持小写字母、数字、短横线和下划线".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_custom_tool_name(name: &str) -> SkillResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("工具名称不能为空".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalized_tool_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn validate_custom_tool_name_unique(
    connection: &Connection,
    name: &str,
    current_key: Option<&str>,
) -> SkillResult<()> {
    let normalized = normalized_tool_name(name);
    if TOOL_TARGET_DEFINITIONS
        .iter()
        .any(|definition| normalized_tool_name(definition.name) == normalized)
    {
        return Err("工具名称已存在".to_string());
    }
    let mut statement = connection
        .prepare("SELECT key, name FROM custom_tool_targets")
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(error_message)?;
    for row in rows {
        let (key, existing_name) = row.map_err(error_message)?;
        if Some(key.as_str()) != current_key && normalized_tool_name(&existing_name) == normalized {
            return Err("工具名称已存在".to_string());
        }
    }
    Ok(())
}

fn custom_tool_key_base(name: &str) -> String {
    let mut base = String::new();
    let mut previous_dash = false;
    for character in name.trim().chars() {
        if character.is_ascii_alphanumeric() {
            base.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash && !base.is_empty() {
            base.push('-');
            previous_dash = true;
        }
    }
    let trimmed = base
        .trim_matches('-')
        .chars()
        .take(32)
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if trimmed.is_empty() {
        "custom-tool".to_string()
    } else {
        trimmed
    }
}

fn generate_custom_tool_key(connection: &Connection, name: &str) -> SkillResult<String> {
    let base = custom_tool_key_base(name);
    let existing = available_tool_target_keys(connection)?;
    if !existing.contains(&base) && validate_custom_tool_key(&base).is_ok() {
        return Ok(base);
    }
    for index in 2..=999 {
        let candidate = format!("{base}-{index}");
        if !existing.contains(&candidate) && validate_custom_tool_key(&candidate).is_ok() {
            return Ok(candidate);
        }
    }
    Err("无法生成自定义工具标识".to_string())
}

fn existing_custom_tool_key(connection: &Connection, key: &str) -> SkillResult<()> {
    connection
        .query_row(
            "SELECT key FROM custom_tool_targets WHERE key = ?1",
            [key],
            |_| Ok(()),
        )
        .map_err(|_| "自定义工具不存在".to_string())
}

fn validate_custom_tool_dir(path: &str) -> SkillResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("全局 Skills 目录不能为空".to_string());
    }
    let directory = PathBuf::from(trimmed);
    if !directory.is_absolute() {
        return Err("全局 Skills 目录必须是绝对路径".to_string());
    }
    Ok(directory.to_string_lossy().to_string())
}

fn copy_custom_tool_icon(workbench_root: &Path, key: &str, source: &str) -> SkillResult<String> {
    let source_path = PathBuf::from(source.trim());
    if !source_path.is_file() {
        return Err("图标文件不存在".to_string());
    }
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "图标文件缺少扩展名".to_string())?;
    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "ico" | "svg"
    ) {
        return Err("图标仅支持 png、jpg、webp、ico 或 svg".to_string());
    }
    let icon_dir = workbench_root.join("tool-icons");
    fs::create_dir_all(&icon_dir).map_err(error_message)?;
    let target = icon_dir.join(format!("{key}.{extension}"));
    if source_path != target {
        fs::copy(&source_path, &target).map_err(error_message)?;
    }
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn select_tool_icon_source<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> SkillResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .add_filter("Image", &["png", "jpg", "jpeg", "webp", "ico", "svg"])
        .blocking_pick_file()
        .map(|path| path.to_string()))
}

#[tauri::command]
pub fn save_custom_tool_target(input: CustomToolTargetInput) -> SkillResult<SkillsState> {
    let name = validate_custom_tool_name(&input.name)?;
    let global_skills_dir = validate_custom_tool_dir(&input.global_skills_dir)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let existing_key = input
        .key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(validate_custom_tool_key)
        .transpose()?;
    if let Some(key) = existing_key.as_deref() {
        existing_custom_tool_key(&connection, key)?;
    }
    validate_custom_tool_name_unique(&connection, &name, existing_key.as_deref())?;
    let key = match existing_key {
        Some(key) => key,
        None => generate_custom_tool_key(&connection, &name)?,
    };
    let icon_path = match input
        .icon_source_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(source) => copy_custom_tool_icon(&workbench_root, &key, source)?,
        None => input.icon_path.unwrap_or_default().trim().to_string(),
    };

    connection
        .execute(
            "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
             VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET
                name = excluded.name,
                global_skills_dir = excluded.global_skills_dir,
                icon_path = excluded.icon_path,
                updated_at = CURRENT_TIMESTAMP",
            params![key, name, global_skills_dir, icon_path],
        )
        .map_err(error_message)?;
    get_skills_state()
}

#[tauri::command]
pub fn delete_custom_tool_target(key: String) -> SkillResult<SkillsState> {
    let key = validate_custom_tool_key(&key)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let icon_path = connection
        .query_row(
            "SELECT icon_path FROM custom_tool_targets WHERE key = ?1",
            [&key],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "自定义工具不存在".to_string())?;

    connection
        .execute("DELETE FROM skill_enablements WHERE tool = ?1", [&key])
        .map_err(error_message)?;
    connection
        .execute("DELETE FROM custom_tool_targets WHERE key = ?1", [&key])
        .map_err(error_message)?;

    let order = configured_tool_target_order(&connection)?;
    let order_json = serde_json::to_string(&order).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![TOOL_TARGET_ORDER_SETTING, order_json],
        )
        .map_err(error_message)?;

    let icon = PathBuf::from(icon_path);
    let managed_icon_dir = workbench_root.join("tool-icons");
    if icon.starts_with(&managed_icon_dir) && icon.is_file() {
        let _ = fs::remove_file(icon);
    }

    get_skills_state()
}

#[tauri::command]
pub fn set_tool_target_order(tool_keys: Vec<String>) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let order = normalized_tool_target_order(&connection, tool_keys)?;
    let order_json = serde_json::to_string(&order).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![TOOL_TARGET_ORDER_SETTING, order_json],
        )
        .map_err(error_message)?;
    get_skills_state()
}

fn normalized_tool_target_order(
    connection: &Connection,
    tool_keys: Vec<String>,
) -> SkillResult<Vec<String>> {
    let targets = tool_targets(connection)?;
    let allowed: HashSet<String> = targets.iter().map(|target| target.key.clone()).collect();
    let mut seen = HashSet::new();
    let mut order = Vec::new();
    for key in tool_keys {
        if !allowed.contains(&key) {
            return Err(format!("不支持的工具: {key}"));
        }
        if seen.insert(key.clone()) {
            order.push(key);
        }
    }
    for target in targets {
        if seen.insert(target.key.clone()) {
            order.push(target.key);
        }
    }
    Ok(order)
}

#[tauri::command]
pub fn set_skill_category(directory_name: String, category_id: String) -> SkillResult<SkillsState> {
    validate_directory_name(&directory_name)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    require_category(&connection, &category_id)?;
    connection
        .execute(
            "INSERT INTO skill_metadata(directory_name, category_id) VALUES(?1, ?2)
             ON CONFLICT(directory_name) DO UPDATE SET category_id = excluded.category_id",
            params![directory_name, category_id],
        )
        .map_err(error_message)?;
    get_skills_state()
}

#[tauri::command]
pub fn create_skill_category(name: String) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    create_skill_category_in(&connection, &name)?;
    get_skills_state()
}

#[tauri::command]
pub fn rename_skill_category(category_id: String, name: String) -> SkillResult<SkillsState> {
    if category_id == UNCATEGORIZED_CATEGORY_ID {
        return Err("未分类不能重命名".to_string());
    }
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    rename_skill_category_in(&connection, &category_id, &name)?;
    get_skills_state()
}

#[tauri::command]
pub fn delete_skill_category(
    category_id: String,
    replacement_category_id: String,
) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    delete_skill_category_in(&connection, &category_id, &replacement_category_id)?;
    get_skills_state()
}

#[tauri::command]
pub fn merge_skill_category(
    source_category_id: String,
    target_category_id: String,
) -> SkillResult<SkillsState> {
    delete_skill_category(source_category_id, target_category_id)
}

fn create_skill_category_in(connection: &Connection, name: &str) -> SkillResult<String> {
    let name = validate_category_name(name)?;
    let id = category_id_for_name(&name);
    connection
        .execute(
            "INSERT INTO skill_categories(id, name, sort_order)
             VALUES(?1, ?2, COALESCE((SELECT MAX(sort_order) + 1 FROM skill_categories), 0))",
            params![id, name],
        )
        .map_err(|error| {
            if is_unique_constraint_error(&error) {
                "分类名称已存在".to_string()
            } else {
                error_message(error)
            }
        })?;
    Ok(id)
}

fn rename_skill_category_in(
    connection: &Connection,
    category_id: &str,
    name: &str,
) -> SkillResult<()> {
    if category_id == UNCATEGORIZED_CATEGORY_ID {
        return Err("未分类不能重命名".to_string());
    }
    let name = validate_category_name(name)?;
    require_category(connection, category_id)?;
    connection
        .execute(
            "UPDATE skill_categories SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![name, category_id],
        )
        .map_err(|error| {
            if is_unique_constraint_error(&error) {
                "分类名称已存在".to_string()
            } else {
                error_message(error)
            }
        })?;
    Ok(())
}

fn delete_skill_category_in(
    connection: &Connection,
    category_id: &str,
    replacement_category_id: &str,
) -> SkillResult<()> {
    if category_id == UNCATEGORIZED_CATEGORY_ID {
        return Err("未分类不能删除".to_string());
    }
    if category_id == replacement_category_id {
        return Err("迁移目标不能是当前分类".to_string());
    }
    require_category(connection, category_id)?;
    require_category(connection, replacement_category_id)?;
    connection
        .execute(
            "UPDATE skill_metadata SET category_id = ?1 WHERE category_id = ?2",
            params![replacement_category_id, category_id],
        )
        .map_err(error_message)?;
    connection
        .execute("DELETE FROM skill_categories WHERE id = ?1", [category_id])
        .map_err(error_message)?;
    Ok(())
}

#[tauri::command]
pub fn import_skills_from_folder(source_path: String) -> SkillResult<Vec<ImportResult>> {
    let settings = current_settings()?;
    let source = PathBuf::from(source_path);
    let candidates = discover_skill_sources(&source)?;
    candidates
        .iter()
        .map(|candidate| import_skill_directory(candidate, Path::new(&settings.skills_root)))
        .collect()
}

#[tauri::command]
pub fn import_skills_from_zip(zip_path: String) -> SkillResult<Vec<ImportResult>> {
    let file = fs::File::open(zip_path).map_err(error_message)?;
    let mut archive = ZipArchive::new(file).map_err(error_message)?;
    let temporary = tempdir().map_err(error_message)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(error_message)?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| "ZIP 中包含不安全路径".to_string())?;
        let destination = temporary.path().join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(error_message)?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(error_message)?;
        }
        let mut output = fs::File::create(destination).map_err(error_message)?;
        io::copy(&mut entry, &mut output).map_err(error_message)?;
    }
    import_skills_from_folder(temporary.path().to_string_lossy().to_string())
}

fn discover_skill_sources(source: &Path) -> SkillResult<Vec<PathBuf>> {
    if source.join("SKILL.md").is_file() {
        return Ok(vec![source.to_path_buf()]);
    }
    let mut candidates = Vec::new();
    for entry in WalkDir::new(source).follow_links(true) {
        let entry = entry.map_err(error_message)?;
        if entry.file_type().is_file() && entry.file_name() == "SKILL.md" {
            if let Some(parent) = entry.path().parent() {
                candidates.push(parent.to_path_buf());
            }
        }
    }
    candidates.sort();
    candidates.dedup();
    Ok(candidates)
}

fn http_get_text(url: &str) -> SkillResult<String> {
    ureq::get(url)
        .set("User-Agent", "Workbench-App/0.1")
        .call()
        .map_err(|error| format!("请求远程来源失败: {error}"))?
        .into_string()
        .map_err(error_message)
}

fn decode_next_payload(html: &str) -> String {
    html.replace("\\\"", "\"")
        .replace("\\n", "\n")
        .replace("\\u0026", "&")
        .replace("\\u003c", "<")
        .replace("\\u003e", ">")
}

fn parse_market_items(html: &str) -> SkillResult<Vec<SkillMarketItem>> {
    let decoded = decode_next_payload(html);
    let pattern = Regex::new(
        r#"\{"source":"([^"]+)","skillId":"([^"]+)","name":"([^"]+)","installs":([0-9]+)(?:,"weeklyInstalls":\[[^\]]*\])?(?:,"isOfficial":(true|false))?"#,
    )
    .map_err(error_message)?;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for captures in pattern.captures_iter(&decoded) {
        let source = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let skill_id = captures
            .get(2)
            .map(|value| value.as_str())
            .unwrap_or_default();
        if !seen.insert(format!("{source}/{skill_id}")) {
            continue;
        }
        let installs = captures
            .get(4)
            .and_then(|value| value.as_str().parse::<i64>().ok())
            .unwrap_or(0);
        let official = captures
            .get(5)
            .map(|value| value.as_str() == "true")
            .unwrap_or(false);
        items.push(SkillMarketItem {
            source: source.to_string(),
            skill_id: skill_id.to_string(),
            name: captures
                .get(3)
                .map(|value| value.as_str().to_string())
                .unwrap_or_else(|| skill_id.to_string()),
            description: String::new(),
            installs,
            official,
            installed_directory_name: None,
            update_status: SkillUpdateState::NotInstalled,
            installable: github_source(source),
        });
    }
    if items.is_empty() {
        return Err("无法从 skills.sh 页面解析市场列表".to_string());
    }
    Ok(items)
}

fn parse_skill_detail(source: &str, skill_id: &str, html: &str) -> SkillMarketDetail {
    let decoded = decode_next_payload(html);
    let description = capture_first(
        &decoded,
        r#""@type":"SoftwareApplication","name":"[^"]+","description":"([^"]*)""#,
    )
    .or_else(|| capture_first(&decoded, r#""description","content":"([^"]*)""#))
    .unwrap_or_default();
    let installs = capture_first(&decoded, r#""userInteractionCount":([0-9]+)"#)
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let preview = capture_first(&decoded, r#""previewHtml":"(.*?)","restHtml""#)
        .map(|value| strip_html(&value))
        .unwrap_or_default();
    let item = SkillMarketItem {
        source: source.to_string(),
        skill_id: skill_id.to_string(),
        name: skill_id.to_string(),
        description,
        installs,
        official: decoded.contains("Verified organization on GitHub"),
        installed_directory_name: None,
        update_status: SkillUpdateState::NotInstalled,
        installable: github_source(source),
    };
    SkillMarketDetail {
        item,
        repository_url: github_repository_url(source).unwrap_or_default(),
        install_command: format!(
            "npx -y skills add {source} --skill {skill_id} -g --agent codex -y --copy"
        ),
        skill_markdown_preview: preview,
        security_note: "Workbench 调用 skills.sh 官方安装器完成获取和展开，再复制到统一 Skills 根目录；第三方 Skill 仍需自行确认来源可信。".to_string(),
    }
}

fn capture_first(input: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()?
        .captures(input)?
        .get(1)
        .map(|value| value.as_str().replace("\\\"", "\""))
}

fn strip_html(value: &str) -> String {
    let decoded = value
        .replace("\\n", "\n")
        .replace("\\\"", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    let without_html = Regex::new(r"<[^>]+>")
        .map(|pattern| pattern.replace_all(&decoded, "").to_string())
        .unwrap_or(decoded);
    without_html
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !(trimmed.starts_with('$')
                && trimmed.len() > 1
                && trimmed[1..]
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric()))
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn github_source(source: &str) -> bool {
    let parts: Vec<_> = source.split('/').collect();
    parts.len() == 2
        && parts
            .iter()
            .all(|part| !part.is_empty() && !part.contains('.') && !part.contains('\\'))
}

fn github_repository_url(source: &str) -> Option<String> {
    github_source(source).then(|| format!("https://github.com/{source}"))
}

fn enrich_market_items(connection: &Connection, items: &mut [SkillMarketItem]) -> SkillResult<()> {
    let sources = list_skill_source_records(connection)?;
    for item in items {
        if let Some(source) = sources
            .iter()
            .find(|source| source.package_slug == format!("{}/{}", item.source, item.skill_id))
        {
            item.installed_directory_name = Some(source.directory_name.clone());
            item.update_status = SkillUpdateState::Installed;
        }
    }
    Ok(())
}

fn list_skill_source_records(connection: &Connection) -> SkillResult<Vec<SkillSourceRecord>> {
    let mut statement = connection
        .prepare(
            "SELECT directory_name, source, package_slug, repo_url, skill_path, installed_ref,
                    installed_hash, remote_ref, last_checked_at, installed_at, updated_at
             FROM skill_sources
             ORDER BY directory_name",
        )
        .map_err(error_message)?;
    let records = statement
        .query_map([], |row| {
            Ok(SkillSourceRecord {
                directory_name: row.get(0)?,
                source: row.get(1)?,
                package_slug: row.get(2)?,
                repo_url: row.get(3)?,
                skill_path: row.get(4)?,
                installed_ref: row.get(5)?,
                installed_hash: row.get(6)?,
                remote_ref: row.get(7)?,
                last_checked_at: row.get(8)?,
                installed_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(error_message)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error_message)?;
    Ok(records)
}

fn upsert_skill_source_record(
    connection: &Connection,
    record: &SkillSourceRecord,
) -> SkillResult<()> {
    connection
        .execute(
            "INSERT INTO skill_sources(
                directory_name, source, package_slug, repo_url, skill_path, installed_ref,
                installed_hash, remote_ref, last_checked_at, installed_at, updated_at
             )
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(directory_name) DO UPDATE SET
                source = excluded.source,
                package_slug = excluded.package_slug,
                repo_url = excluded.repo_url,
                skill_path = excluded.skill_path,
                installed_ref = excluded.installed_ref,
                installed_hash = excluded.installed_hash,
                remote_ref = excluded.remote_ref,
                last_checked_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP",
            params![
                record.directory_name,
                record.source,
                record.package_slug,
                record.repo_url,
                record.skill_path,
                record.installed_ref,
                record.installed_hash,
                record.remote_ref
            ],
        )
        .map_err(error_message)?;
    Ok(())
}

fn source_record_for_directory(
    connection: &Connection,
    directory_name: &str,
) -> SkillResult<SkillSourceRecord> {
    connection
        .query_row(
            "SELECT directory_name, source, package_slug, repo_url, skill_path, installed_ref,
                    installed_hash, remote_ref, last_checked_at, installed_at, updated_at
             FROM skill_sources WHERE directory_name = ?1",
            [directory_name],
            |row| {
                Ok(SkillSourceRecord {
                    directory_name: row.get(0)?,
                    source: row.get(1)?,
                    package_slug: row.get(2)?,
                    repo_url: row.get(3)?,
                    skill_path: row.get(4)?,
                    installed_ref: row.get(5)?,
                    installed_hash: row.get(6)?,
                    remote_ref: row.get(7)?,
                    last_checked_at: row.get(8)?,
                    installed_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
        .map_err(error_message)
}

fn skills_cli_command_name(command: &str) -> String {
    if cfg!(windows) && matches!(command, "npm" | "npx") {
        format!("{command}.cmd")
    } else {
        command.to_string()
    }
}

fn skills_cli_install_args(source: &str, skill_id: &str) -> Vec<String> {
    [
        "-y", "skills", "add", source, "--skill", skill_id, "-g", "--agent", "codex", "-y",
        "--copy",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

fn skills_cli_app_data(home: &Path) -> PathBuf {
    home.join("AppData").join("Roaming")
}

fn skills_cli_skill_path(home: &Path, skill_id: &str) -> PathBuf {
    home.join(".agents").join("skills").join(skill_id)
}

fn missing_skills_cli_dependency_message(missing: &[&str]) -> String {
    format!(
        "未检测到 {}，无法调用 skills.sh 官方安装器。请安装 Node.js LTS，并确认 npm/npx 可在终端中使用后重试。",
        missing.join("、")
    )
}

fn require_skills_cli_dependencies() -> SkillResult<()> {
    let mut missing = Vec::new();
    for command in ["node", "npm", "npx"] {
        let status = Command::new(skills_cli_command_name(command))
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if !matches!(status, Ok(status) if status.success()) {
            missing.push(command);
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing_skills_cli_dependency_message(&missing))
    }
}

fn run_command_with_timeout(command: &mut Command, timeout: Duration) -> SkillResult<Output> {
    let mut child = command.spawn().map_err(|error| {
        format!("无法启动 skills.sh 官方安装器：{error}。请确认 Node.js/npm/npx 已正确安装。")
    })?;
    let started_at = Instant::now();
    loop {
        match child.try_wait().map_err(error_message)? {
            Some(_) => return child.wait_with_output().map_err(error_message),
            None if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("skills.sh 官方安装器执行超时，请检查网络后重试。".to_string());
            }
            None => thread::sleep(Duration::from_millis(150)),
        }
    }
}

fn skills_cli_output_text(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn skills_cli_failure_message(output: &Output) -> String {
    let detail = skills_cli_output_text(output);
    if detail.is_empty() {
        "skills.sh 官方安装器执行失败，请检查网络或稍后重试。".to_string()
    } else {
        format!("skills.sh 官方安装器执行失败：{detail}")
    }
}

fn extract_skill_with_skills_cli(
    source: &str,
    skill_id: &str,
    on_progress: &dyn Fn(u8),
) -> SkillResult<(tempfile::TempDir, PathBuf, String, String)> {
    if !github_source(source) {
        return Err("当前仅支持 GitHub owner/repo 格式的 skills.sh 来源".to_string());
    }
    on_progress(12);
    require_skills_cli_dependencies()?;
    on_progress(20);
    let temporary = tempdir().map_err(error_message)?;
    let app_data = skills_cli_app_data(temporary.path());
    fs::create_dir_all(&app_data).map_err(error_message)?;
    let mut command = Command::new(skills_cli_command_name("npx"));
    command
        .args(skills_cli_install_args(source, skill_id))
        .current_dir(temporary.path())
        .env("HOME", temporary.path())
        .env("USERPROFILE", temporary.path())
        .env("APPDATA", &app_data)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    on_progress(45);
    let output = run_command_with_timeout(
        &mut command,
        Duration::from_secs(SKILLS_CLI_TIMEOUT_SECONDS),
    )?;
    if !output.status.success() {
        return Err(skills_cli_failure_message(&output));
    }
    on_progress(72);
    let skill = skills_cli_skill_path(temporary.path(), skill_id);
    if !skill.join("SKILL.md").is_file() {
        return Err(format!(
            "skills.sh 官方安装器未生成 Skill: {skill_id}。请确认该 Skill 是否存在或稍后重试。"
        ));
    }
    let relative = format!(".agents/skills/{skill_id}");
    let hash = directory_content_hash(&skill)?;
    on_progress(84);
    Ok((temporary, skill, relative, hash))
}

fn directory_content_hash(root: &Path) -> SkillResult<String> {
    let mut entries = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(error_message)?
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = fs::read(entry.path()).map_err(error_message)?;
        entries.push((relative, bytes));
    }
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for (relative, bytes) in entries {
        relative.hash(&mut hasher);
        bytes.hash(&mut hasher);
    }
    Ok(format!("{:016x}", hasher.finish()))
}

fn source_backup_path(workbench_root: &Path, directory_name: &str) -> SkillResult<PathBuf> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error_message)?
        .as_secs();
    Ok(workbench_root
        .join("backups")
        .join("skills")
        .join(timestamp.to_string())
        .join("skills-sh")
        .join(directory_name))
}

#[tauri::command]
pub fn list_skill_market(query: Option<String>) -> SkillResult<Vec<SkillMarketItem>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let html = http_get_text("https://www.skills.sh")?;
    let mut items = parse_market_items(&html)?;
    enrich_market_items(&connection, &mut items)?;
    let normalized = query.unwrap_or_default().trim().to_lowercase();
    if !normalized.is_empty() {
        items.retain(|item| {
            item.name.to_lowercase().contains(&normalized)
                || item.skill_id.to_lowercase().contains(&normalized)
                || item.source.to_lowercase().contains(&normalized)
        });
    }
    Ok(items)
}

#[tauri::command]
pub fn get_skill_market_detail(source: String, skill_id: String) -> SkillResult<SkillMarketDetail> {
    let encoded_url = format!("https://www.skills.sh/{source}/{skill_id}");
    let html = http_get_text(&encoded_url)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let mut detail = parse_skill_detail(&source, &skill_id, &html);
    enrich_market_items(&connection, std::slice::from_mut(&mut detail.item))?;
    Ok(detail)
}

fn install_skill_from_market_sync(
    source: String,
    skill_id: String,
    on_progress: &dyn Fn(u8),
) -> SkillResult<SkillsState> {
    validate_directory_name(&skill_id)?;
    on_progress(8);
    let settings = current_settings()?;
    let target_root = PathBuf::from(&settings.skills_root);
    let target = target_root.join(&skill_id);
    if target.exists() {
        return Err("统一根目录中已存在同名 Skill，安装已停止".to_string());
    }
    let (_temporary, skill_source, relative, hash) =
        extract_skill_with_skills_cli(&source, &skill_id, on_progress)?;
    copy_to_new_target(&skill_source, &target)?;
    on_progress(92);
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    let record = SkillSourceRecord {
        directory_name: skill_id.clone(),
        source: "skills_sh".to_string(),
        package_slug: format!("{source}/{skill_id}"),
        repo_url: github_repository_url(&source).unwrap_or_default(),
        skill_path: relative,
        installed_ref: hash.clone(),
        installed_hash: hash.clone(),
        remote_ref: hash,
        last_checked_at: String::new(),
        installed_at: String::new(),
        updated_at: String::new(),
    };
    upsert_skill_source_record(&connection, &record)?;
    on_progress(97);
    let state = get_skills_state()?;
    on_progress(100);
    Ok(state)
}

#[tauri::command]
pub async fn install_skill_from_market(
    app: AppHandle,
    source: String,
    skill_id: String,
) -> SkillResult<SkillsState> {
    let progress_source = source.clone();
    let progress_skill_id = skill_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        install_skill_from_market_sync(source, skill_id, &|progress| {
            let _ = app.emit(
                "skill-install-progress",
                SkillInstallProgress {
                    source: progress_source.clone(),
                    skill_id: progress_skill_id.clone(),
                    progress,
                },
            );
        })
    })
    .await
    .map_err(error_message)?
}

#[tauri::command]
pub fn list_skill_updates() -> SkillResult<Vec<SkillUpdateStatus>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let records = list_skill_source_records(&connection)?;
    let settings = current_settings()?;
    Ok(records
        .into_iter()
        .map(|record| {
            let skill_path = PathBuf::from(&settings.skills_root)
                .join(&record.directory_name)
                .join("SKILL.md");
            let metadata = fs::read_to_string(skill_path)
                .map(|markdown| parse_skill_markdown(&markdown, &record.directory_name))
                .unwrap_or_else(|_| SkillMetadata {
                    name: record.directory_name.clone(),
                    description: String::new(),
                });
            SkillUpdateStatus {
                source: record,
                name: metadata.name,
                description: metadata.description,
                status: SkillUpdateState::Installed,
                message: "尚未检查".to_string(),
            }
        })
        .collect())
}

#[tauri::command]
pub fn check_skill_updates() -> SkillResult<Vec<SkillUpdateStatus>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let mut results = Vec::new();
    for record in list_skill_source_records(&connection)? {
        let mut status = SkillUpdateState::CheckFailed;
        let mut message = "检查失败".to_string();
        let mut next_record = record.clone();
        if let Some((source, skill_id)) = record.package_slug.rsplit_once('/') {
            match extract_skill_with_skills_cli(source, skill_id, &|_| {}) {
                Ok((_temporary, _skill_source, _relative, hash)) => {
                    next_record.remote_ref = hash.clone();
                    status = if hash == record.installed_hash {
                        SkillUpdateState::UpToDate
                    } else {
                        SkillUpdateState::UpdateAvailable
                    };
                    message = if status == SkillUpdateState::UpToDate {
                        "已是最新".to_string()
                    } else {
                        "发现可更新版本".to_string()
                    };
                    upsert_skill_source_record(&connection, &next_record)?;
                }
                Err(error) => {
                    message = error;
                }
            }
        }
        results.push(SkillUpdateStatus {
            name: next_record.directory_name.clone(),
            description: String::new(),
            source: next_record,
            status,
            message,
        });
    }
    Ok(results)
}

#[tauri::command]
pub fn update_skill_from_market(directory_name: String) -> SkillResult<SkillUpdateResult> {
    validate_directory_name(&directory_name)?;
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    let record = source_record_for_directory(&connection, &directory_name)?;
    let (source, skill_id) = record
        .package_slug
        .rsplit_once('/')
        .ok_or_else(|| "来源记录无效".to_string())?;
    let (_temporary, remote_skill, relative, hash) =
        extract_skill_with_skills_cli(source, skill_id, &|_| {})?;
    if hash == record.installed_hash {
        return Ok(SkillUpdateResult {
            directory_name,
            status: SkillUpdateState::UpToDate,
            message: "已是最新".to_string(),
        });
    }
    let target = PathBuf::from(&settings.skills_root).join(&record.directory_name);
    if !target.is_dir() {
        return Err("本地 Skill 目录不存在，无法更新".to_string());
    }
    let backup = source_backup_path(&workbench_root, &record.directory_name)?;
    copy_path_to_backup(&target, &backup)?;
    replace_directory_from(&remote_skill, &target)?;
    let next_record = SkillSourceRecord {
        installed_ref: hash.clone(),
        installed_hash: hash.clone(),
        remote_ref: hash,
        skill_path: relative,
        ..record
    };
    upsert_skill_source_record(&connection, &next_record)?;
    Ok(SkillUpdateResult {
        directory_name: next_record.directory_name,
        status: SkillUpdateState::UpToDate,
        message: format!("已更新，旧版本已备份到 {}", backup.to_string_lossy()),
    })
}

#[tauri::command]
pub fn update_market_skills(directory_names: Vec<String>) -> SkillResult<Vec<SkillUpdateResult>> {
    let mut results = Vec::new();
    for directory_name in directory_names {
        match update_skill_from_market(directory_name.clone()) {
            Ok(result) => results.push(result),
            Err(error) => results.push(SkillUpdateResult {
                directory_name,
                status: SkillUpdateState::CheckFailed,
                message: error,
            }),
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn set_skill_enabled(
    directory_name: String,
    tool: String,
    enabled: bool,
    scope: String,
    project_name: Option<String>,
    project_path: Option<String>,
) -> SkillResult<SkillsState> {
    validate_directory_name(&directory_name)?;
    if scope != "global" && scope != "project" {
        return Err(format!("不支持的启用范围: {scope}"));
    }
    let settings = current_settings()?;
    let source = PathBuf::from(&settings.skills_root).join(&directory_name);
    if !source.join("SKILL.md").is_file() {
        return Err("统一根目录中不存在该 Skill".to_string());
    }

    let project = if scope == "project" {
        Some(
            project_path
                .as_deref()
                .ok_or_else(|| "项目级启用必须提供项目路径".to_string())?,
        )
    } else {
        None
    };
    let target_root = tool_target_path(&tool, project)?;
    fs::create_dir_all(&target_root).map_err(error_message)?;
    let target = target_root.join(&directory_name);
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;

    if enabled {
        if target.exists() || target.symlink_metadata().is_ok() {
            let managed_method = connection
                .query_row(
                    "SELECT sync_method FROM skill_enablements
                     WHERE directory_name = ?1 AND tool = ?2 AND scope = ?3 AND project_path = ?4 AND link_path = ?5",
                    params![
                        directory_name,
                        tool,
                        scope,
                        project_path.clone().unwrap_or_default(),
                        target.to_string_lossy().to_string()
                    ],
                    |row| row.get::<_, String>(0),
                )
                .ok()
                .and_then(|value| parse_sync_method(&value).ok());
            if managed_method.map(|method| managed_target_is_active(&source, &target, method))
                != Some(true)
            {
                return Err(format!(
                    "目标位置已存在，Workbench 不会覆盖: {}",
                    target.display()
                ));
            }
            return get_skills_state();
        } else {
            let sync_method = sync_directory_auto_with(&source, &target, create_directory_symlink)?;
            connection
                .execute(
                    "INSERT INTO skill_enablements(directory_name, tool, scope, project_name, project_path, link_path, sync_method)
                     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(directory_name, tool, scope, project_path)
                     DO UPDATE SET project_name = excluded.project_name, link_path = excluded.link_path, sync_method = excluded.sync_method",
                    params![
                        directory_name,
                        tool,
                        scope,
                        project_name.unwrap_or_default(),
                        project_path.unwrap_or_default(),
                        target.to_string_lossy().to_string(),
                        sync_method_name(sync_method)
                    ],
                )
                .map_err(error_message)?;
        }
    } else {
        let (managed_path, sync_method) = connection
            .query_row(
                "SELECT link_path, sync_method FROM skill_enablements
                 WHERE directory_name = ?1 AND tool = ?2 AND scope = ?3 AND project_path = ?4",
                params![
                    directory_name,
                    tool,
                    scope,
                    project_path.clone().unwrap_or_default()
                ],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|_| "未找到由 Workbench 管理的启用记录".to_string())?;
        if Path::new(&managed_path) != target {
            return Err("受管目标路径与当前工具路径不一致".to_string());
        }
        remove_managed_target(&source, &target, parse_sync_method(&sync_method)?)?;
        connection
            .execute(
                "DELETE FROM skill_enablements
                 WHERE directory_name = ?1 AND tool = ?2 AND scope = ?3 AND project_path = ?4",
                params![
                    directory_name,
                    tool,
                    scope,
                    project_path.unwrap_or_default()
                ],
            )
            .map_err(error_message)?;
    }
    get_skills_state()
}

fn sync_method_name(method: SyncMethod) -> &'static str {
    match method {
        SyncMethod::Symlink => "symlink",
        SyncMethod::Copy => "copy",
    }
}

fn parse_sync_method(method: &str) -> SkillResult<SyncMethod> {
    match method {
        "symlink" => Ok(SyncMethod::Symlink),
        "copy" => Ok(SyncMethod::Copy),
        _ => Err(format!("未知同步方式: {method}")),
    }
}

#[tauri::command]
pub fn open_local_path(path: String) -> SkillResult<()> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("路径不存在".to_string());
    }
    #[cfg(windows)]
    Command::new("explorer")
        .arg(path)
        .spawn()
        .map_err(error_message)?;
    #[cfg(not(windows))]
    return Err("当前系统暂不支持打开本地路径".to_string());
    Ok(())
}

#[tauri::command]
pub fn create_and_open_directory(path: String) -> SkillResult<()> {
    let path = PathBuf::from(path);
    if path.exists() && !path.is_dir() {
        return Err("目标路径已存在但不是目录".to_string());
    }
    fs::create_dir_all(&path).map_err(error_message)?;
    open_local_path(path.to_string_lossy().to_string())
}

fn validate_directory_name(directory_name: &str) -> SkillResult<()> {
    let path = Path::new(directory_name);
    if directory_name.is_empty()
        || path.is_absolute()
        || path.components().count() != 1
        || directory_name == "."
        || directory_name == ".."
    {
        return Err("Skill 目录名称无效".to_string());
    }
    Ok(())
}

fn validate_category_name(name: &str) -> SkillResult<String> {
    let normalized = normalize_category_name(name);
    if normalized == UNCATEGORIZED_CATEGORY_NAME {
        return Err("未分类是系统分类".to_string());
    }
    Ok(normalized)
}

fn is_unique_constraint_error(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(_, Some(message))
            if message.contains("UNIQUE constraint failed")
    )
}

fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn in_memory_settings_connection() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "CREATE TABLE custom_tool_targets (
                    key TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    global_skills_dir TEXT NOT NULL,
                    icon_path TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )",
                [],
            )
            .unwrap();
        connection
    }

    #[test]
    fn parses_skill_frontmatter_name_and_description() {
        let markdown = "---\nname: example-skill\ndescription: Example description\n---\n# Body";

        let metadata = parse_skill_markdown(markdown, "fallback");

        assert_eq!(metadata.name, "example-skill");
        assert_eq!(metadata.description, "Example description");
    }

    #[test]
    fn parses_skill_frontmatter_with_windows_line_endings() {
        let markdown = "---\r\nname: windows-skill\r\ndescription: Windows\r\n---\r\n# Body";

        let metadata = parse_skill_markdown(markdown, "fallback");

        assert_eq!(metadata.name, "windows-skill");
        assert_eq!(metadata.description, "Windows");
    }

    #[test]
    fn scans_only_directories_containing_skill_markdown() {
        let root = tempdir().unwrap();
        let valid = root.path().join("valid");
        let invalid = root.path().join("invalid");
        fs::create_dir_all(&valid).unwrap();
        fs::create_dir_all(&invalid).unwrap();
        fs::write(valid.join("SKILL.md"), "# Valid").unwrap();

        let skills = scan_skill_directories(root.path()).unwrap();

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].directory_name, "valid");
    }

    #[test]
    fn parses_skills_sh_market_items_from_embedded_page_data() {
        let html = r#"
            <script>
              self.__next_f.push([1,"{\"source\":\"vercel-labs/next-skills\",\"skillId\":\"next-upgrade\",\"name\":\"next-upgrade\",\"installs\":24209,\"weeklyInstalls\":[1,2],\"isOfficial\":true}"]);
              self.__next_f.push([1,"{\"source\":\"skills.volces.com\",\"skillId\":\"byted-web-search\",\"name\":\"byted-web-search\",\"installs\":25028}"]);
            </script>
        "#;

        let items = parse_market_items(html).unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].source, "vercel-labs/next-skills");
        assert_eq!(items[0].skill_id, "next-upgrade");
        assert!(items[0].official);
        assert!(items[0].installable);
        assert_eq!(items[1].update_status, SkillUpdateState::NotInstalled);
        assert!(!items[1].installable);
    }

    #[test]
    fn builds_official_skills_cli_install_arguments() {
        let args = skills_cli_install_args("anthropics/skills", "frontend-design");

        assert_eq!(
            args,
            vec![
                "-y",
                "skills",
                "add",
                "anthropics/skills",
                "--skill",
                "frontend-design",
                "-g",
                "--agent",
                "codex",
                "-y",
                "--copy"
            ]
        );
    }

    #[test]
    fn resolves_skills_cli_paths_inside_the_temporary_home() {
        let root = PathBuf::from("C:/temp/workbench-cli");

        assert_eq!(
            skills_cli_skill_path(&root, "frontend-design"),
            root.join(".agents").join("skills").join("frontend-design")
        );
        assert_eq!(
            skills_cli_app_data(&root),
            root.join("AppData").join("Roaming")
        );
    }

    #[test]
    fn explains_missing_skills_cli_dependencies_as_a_node_boundary() {
        let message = missing_skills_cli_dependency_message(&["node", "npm", "npx"]);

        assert!(message.contains("Node.js LTS"));
        assert!(message.contains("npm/npx"));
    }

    #[test]
    fn uses_cmd_shims_for_npm_tools_on_windows() {
        if cfg!(windows) {
            assert_eq!(skills_cli_command_name("npx"), "npx.cmd");
            assert_eq!(skills_cli_command_name("npm"), "npm.cmd");
            assert_eq!(skills_cli_command_name("node"), "node");
        } else {
            assert_eq!(skills_cli_command_name("npx"), "npx");
            assert_eq!(skills_cli_command_name("npm"), "npm");
            assert_eq!(skills_cli_command_name("node"), "node");
        }
    }

    #[test]
    fn strips_next_payload_tokens_from_skill_preview() {
        let preview = strip_html("<p>Useful skill</p>\n$2b\n<p>More detail</p>");

        assert_eq!(preview, "Useful skill\nMore detail");
    }

    #[test]
    fn rejects_market_skill_ids_that_escape_the_skills_root() {
        assert!(validate_directory_name("../outside").is_err());
        assert!(validate_directory_name("nested/skill").is_err());
        assert!(validate_directory_name("market-skill").is_ok());
    }

    #[test]
    fn persists_skills_sh_source_records_for_update_checks() {
        let connection = Connection::open_in_memory().unwrap();
        ensure_skill_source_schema(&connection).unwrap();
        let record = SkillSourceRecord {
            directory_name: "next-upgrade".to_string(),
            source: "skills_sh".to_string(),
            package_slug: "vercel-labs/next-skills/next-upgrade".to_string(),
            repo_url: "https://github.com/vercel-labs/next-skills".to_string(),
            skill_path: "next-upgrade".to_string(),
            installed_ref: "main".to_string(),
            installed_hash: "local-1".to_string(),
            remote_ref: "local-1".to_string(),
            last_checked_at: String::new(),
            installed_at: String::new(),
            updated_at: String::new(),
        };

        upsert_skill_source_record(&connection, &record).unwrap();
        let records = list_skill_source_records(&connection).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].directory_name, "next-upgrade");
        assert_eq!(
            records[0].repo_url,
            "https://github.com/vercel-labs/next-skills"
        );
    }

    #[test]
    fn resolves_registered_global_tool_paths() {
        assert!(tool_target_path("deveco", None)
            .unwrap()
            .ends_with(Path::new(".config").join("deveco").join("skills")));
        assert!(tool_target_path("kimi", None)
            .unwrap()
            .ends_with(Path::new(".kimi-code").join("skills")));
        assert!(tool_target_path("pi", None)
            .unwrap()
            .ends_with(Path::new(".pi").join("agent").join("skills")));
    }

    #[test]
    fn rejects_project_scope_for_global_only_tools() {
        let result = tool_target_path("deveco", Some("E:\\Project"));

        assert!(result.unwrap_err().contains("工具不支持项目级 Skills"));
    }

    #[test]
    fn orders_tool_targets_from_settings_and_appends_new_defaults() {
        let connection = in_memory_settings_connection();
        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES(?1, ?2)",
                params![TOOL_TARGET_ORDER_SETTING, "[\"kimi\",\"codex\"]"],
            )
            .unwrap();

        let targets = ordered_tool_targets(&connection).unwrap();

        assert_eq!(targets[0].key, "kimi");
        assert_eq!(targets[1].key, "codex");
        assert!(targets.iter().any(|target| target.key == "junie"));
    }

    #[test]
    fn normalizes_tool_order_by_deduping_and_appending_defaults() {
        let connection = in_memory_settings_connection();
        let order = normalized_tool_target_order(
            &connection,
            vec!["claude".into(), "codex".into(), "claude".into()],
        )
        .unwrap();

        assert_eq!(&order[0..2], ["claude", "codex"]);
        assert_eq!(order.len(), TOOL_TARGET_DEFINITIONS.len());
    }

    #[test]
    fn includes_custom_tool_targets_in_ordering() {
        let connection = in_memory_settings_connection();
        connection
            .execute(
                "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
                 VALUES('my-agent', 'My Agent', 'C:\\Users\\dev\\.my-agent\\skills', '')",
                [],
            )
            .unwrap();

        let order = normalized_tool_target_order(&connection, vec!["my-agent".into()]).unwrap();
        let targets = ordered_tool_targets(&connection).unwrap();

        assert_eq!(order[0], "my-agent");
        assert!(targets.iter().any(|target| {
            target.key == "my-agent"
                && target.name == "My Agent"
                && target.source == ToolTargetSource::Custom
        }));
    }

    #[test]
    fn generates_custom_tool_key_from_name() {
        let connection = in_memory_settings_connection();

        let english = generate_custom_tool_key(&connection, "My Agent").unwrap();
        let chinese = generate_custom_tool_key(&connection, "通义灵码").unwrap();

        assert_eq!(english, "my-agent");
        assert_eq!(chinese, "custom-tool");
    }

    #[test]
    fn custom_tool_names_must_be_unique() {
        let connection = in_memory_settings_connection();
        connection
            .execute(
                "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
                 VALUES('my-agent', 'My Agent', 'C:\\Users\\dev\\.my-agent\\skills', '')",
                [],
            )
            .unwrap();

        let duplicate_custom =
            validate_custom_tool_name_unique(&connection, " my agent ", None).unwrap_err();
        let duplicate_builtin =
            validate_custom_tool_name_unique(&connection, "Codex", None).unwrap_err();
        let same_tool_edit =
            validate_custom_tool_name_unique(&connection, "My Agent", Some("my-agent"));

        assert_eq!(duplicate_custom, "工具名称已存在");
        assert_eq!(duplicate_builtin, "工具名称已存在");
        assert!(same_tool_edit.is_ok());
    }

    #[test]
    fn close_behavior_defaults_to_hide_to_tray() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();

        let behavior = configured_close_behavior(&connection).unwrap();

        assert_eq!(behavior, CloseBehavior::HideToTray);
    }

    #[test]
    fn close_behavior_reads_configured_value() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES(?1, ?2)",
                params![CLOSE_BEHAVIOR_SETTING, "\"hide_to_tray\""],
            )
            .unwrap();

        let behavior = configured_close_behavior(&connection).unwrap();

        assert_eq!(behavior, CloseBehavior::HideToTray);
    }

    #[test]
    fn close_behavior_treats_legacy_ask_as_hide_to_tray() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES(?1, ?2)",
                params![CLOSE_BEHAVIOR_SETTING, "\"ask\""],
            )
            .unwrap();

        let behavior = configured_close_behavior(&connection).unwrap();

        assert_eq!(behavior, CloseBehavior::HideToTray);
    }

    #[test]
    fn close_behavior_rejects_invalid_value() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES(?1, ?2)",
                params![CLOSE_BEHAVIOR_SETTING, "\"minimize\""],
            )
            .unwrap();

        let error = configured_close_behavior(&connection).unwrap_err();

        assert!(error.contains("unknown variant"));
    }

    #[test]
    fn bool_setting_reads_default_and_configured_value() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();

        assert!(
            !configured_bool_setting(&connection, CLOSE_TRAY_HINT_DISMISSED_SETTING, false)
                .unwrap()
        );

        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES(?1, ?2)",
                params![CLOSE_TRAY_HINT_DISMISSED_SETTING, "true"],
            )
            .unwrap();

        assert!(
            configured_bool_setting(&connection, CLOSE_TRAY_HINT_DISMISSED_SETTING, false).unwrap()
        );
    }

    #[test]
    fn importing_same_directory_name_returns_conflict_without_overwrite() {
        let source_root = tempdir().unwrap();
        let target_root = tempdir().unwrap();
        let source = source_root.path().join("shared");
        let target = target_root.path().join("shared");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("SKILL.md"), "new").unwrap();
        fs::write(target.join("SKILL.md"), "existing").unwrap();

        let result = import_skill_directory(&source, target_root.path()).unwrap();

        assert_eq!(result.status, ImportStatus::Conflict);
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "existing"
        );
    }

    #[test]
    fn importing_skill_copies_contents_into_target_root() {
        let source_root = tempdir().unwrap();
        let target_root = tempdir().unwrap();
        let source = source_root.path().join("shared");
        fs::create_dir_all(source.join("references")).unwrap();
        fs::write(source.join("SKILL.md"), "# Shared").unwrap();
        fs::write(source.join("references").join("guide.md"), "guide").unwrap();

        let result = import_skill_directory(&source, target_root.path()).unwrap();

        assert_eq!(result.status, ImportStatus::Imported);
        assert_eq!(
            fs::read_to_string(target_root.path().join("shared/references/guide.md")).unwrap(),
            "guide"
        );
    }

    #[test]
    fn migrates_legacy_skill_categories_to_category_table() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
                CREATE TABLE skill_categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE skill_metadata (
                    directory_name TEXT PRIMARY KEY,
                    category TEXT NOT NULL DEFAULT '未分类'
                );
                INSERT INTO skill_metadata(directory_name, category) VALUES
                    ('security-review', '安全'),
                    ('empty-category', ''),
                    ('second-security', '安全');
                ",
            )
            .unwrap();

        ensure_skill_category_schema(&connection).unwrap();

        let categories = list_skill_categories(&connection).unwrap();
        assert!(categories
            .iter()
            .any(|category| category.id == UNCATEGORIZED_CATEGORY_ID && category.name == "未分类"));
        assert!(categories.iter().any(|category| category.name == "安全"));
        assert!(!table_has_column(&connection, "skill_metadata", "category").unwrap());
        assert!(table_has_column(&connection, "skill_metadata", "category_id").unwrap());

        let security_category_id = category_id_for_name("安全");
        let stored_category_id: String = connection
            .query_row(
                "SELECT category_id FROM skill_metadata WHERE directory_name = 'security-review'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored_category_id, security_category_id);
    }

    #[test]
    fn manages_categories_and_moves_skills_between_category_ids() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
                CREATE TABLE skill_categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                ",
            )
            .unwrap();
        ensure_skill_category_schema(&connection).unwrap();
        let source_id = create_skill_category_in(&connection, "开发工程").unwrap();
        let target_id = create_skill_category_in(&connection, "文档与内容").unwrap();
        connection
            .execute(
                "INSERT INTO skill_metadata(directory_name, category_id) VALUES(?1, ?2)",
                params!["code-cleaner", &source_id],
            )
            .unwrap();

        rename_skill_category_in(&connection, &source_id, "工程质量").unwrap();
        assert!(create_skill_category_in(&connection, "工程质量").is_err());

        delete_skill_category_in(&connection, &source_id, &target_id).unwrap();
        let moved_category_id: String = connection
            .query_row(
                "SELECT category_id FROM skill_metadata WHERE directory_name = 'code-cleaner'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(moved_category_id, target_id);
        assert!(require_category(&connection, &source_id).is_err());
        assert!(
            delete_skill_category_in(&connection, UNCATEGORIZED_CATEGORY_ID, &target_id).is_err()
        );
    }

    #[test]
    fn auto_sync_falls_back_to_copy_when_symlink_creation_fails() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("SKILL.md"), "# Shared").unwrap();

        let method = sync_directory_auto_with(&source, &target, |_, _| {
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "denied"))
        })
        .unwrap();

        assert_eq!(method, SyncMethod::Copy);
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "# Shared"
        );
    }

    #[test]
    fn auto_sync_does_not_overwrite_existing_target() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("SKILL.md"), "source").unwrap();
        fs::write(target.join("SKILL.md"), "existing").unwrap();

        let result = sync_directory_auto_with(&source, &target, |_, _| {
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "denied"))
        });

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "existing"
        );
    }

    #[test]
    fn disabling_managed_copy_removes_target_without_removing_source() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("SKILL.md"), "source").unwrap();
        fs::write(target.join("SKILL.md"), "copy").unwrap();

        remove_managed_target(&source, &target, SyncMethod::Copy).unwrap();

        assert!(source.exists());
        assert!(!target.exists());
    }

    #[test]
    fn deleting_market_skill_removes_source_managed_targets_and_source_record_only() {
        let root = tempdir().unwrap();
        let workbench_root = root.path().join("workbench");
        let source = root.path().join("skills").join("market-skill");
        let managed_target = root.path().join("tool").join("market-skill");
        let unmanaged_target = root.path().join("external").join("market-skill");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&managed_target).unwrap();
        fs::create_dir_all(&unmanaged_target).unwrap();
        fs::write(source.join("SKILL.md"), "source").unwrap();
        fs::write(managed_target.join("SKILL.md"), "managed").unwrap();
        fs::write(unmanaged_target.join("SKILL.md"), "unmanaged").unwrap();

        let connection = open_database(&workbench_root).unwrap();
        connection
            .execute(
                "INSERT INTO skill_enablements(directory_name, tool, scope, project_name, project_path, link_path, sync_method)
                 VALUES('market-skill', 'codex', 'global', '', '', ?1, 'copy')",
                [managed_target.to_string_lossy().to_string()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO skill_sources(
                    directory_name, source, package_slug, repo_url, skill_path,
                    installed_ref, installed_hash, remote_ref
                 )
                 VALUES('market-skill', 'skills_sh', 'owner/repo/market-skill',
                    'https://github.com/owner/repo', 'skills/market-skill',
                    'abc', 'abc', 'abc')",
                [],
            )
            .unwrap();

        delete_skill_in(&connection, &source, "market-skill").unwrap();

        assert!(!source.exists());
        assert!(!managed_target.exists());
        assert!(unmanaged_target.exists());
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM skill_sources WHERE directory_name = 'market-skill'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM skill_enablements WHERE directory_name = 'market-skill'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn detects_matching_external_copy_and_content_conflict() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let matching = root.path().join("matching");
        let conflict = root.path().join("conflict");
        for path in [&source, &matching, &conflict] {
            fs::create_dir_all(path).unwrap();
        }
        fs::write(source.join("SKILL.md"), "same").unwrap();
        fs::write(matching.join("SKILL.md"), "same").unwrap();
        fs::write(conflict.join("SKILL.md"), "different").unwrap();

        assert_eq!(
            detect_external_status(&source, &matching).unwrap(),
            GlobalStatus::External
        );
        assert_eq!(
            detect_external_status(&source, &conflict).unwrap(),
            GlobalStatus::Conflict
        );
    }

    #[test]
    fn replacing_directory_backs_up_existing_source_first() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        let backup = root.path().join("backup");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("SKILL.md"), "workbench").unwrap();
        fs::write(target.join("SKILL.md"), "tool").unwrap();

        copy_path_to_backup(&source, &backup).unwrap();
        replace_directory_from(&target, &source).unwrap();

        assert_eq!(fs::read_to_string(source.join("SKILL.md")).unwrap(), "tool");
        assert_eq!(
            fs::read_to_string(backup.join("SKILL.md")).unwrap(),
            "workbench"
        );
    }

    #[cfg(windows)]
    #[test]
    fn disabling_does_not_remove_unmanaged_real_directory() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();

        let result = remove_managed_symlink(&source, &target);

        assert!(result.is_err());
        assert!(target.exists());
    }

    #[cfg(windows)]
    #[test]
    fn disabling_removes_managed_symlink_without_removing_source() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::create_dir_all(&source).unwrap();
        if let Err(error) = create_directory_symlink(&source, &target) {
            eprintln!("当前 Windows 会话无法创建符号链接，跳过受管链接移除验证: {error}");
            return;
        }

        remove_managed_symlink(&source, &target).unwrap();

        assert!(source.exists());
        assert!(!target.exists());
    }
}
