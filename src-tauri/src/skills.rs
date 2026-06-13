use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::DialogExt;
use tempfile::tempdir;
use walkdir::WalkDir;
use zip::ZipArchive;

type SkillResult<T> = Result<T, String>;

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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillsSettings {
    pub workbench_root: String,
    pub skills_root: String,
    pub tool_targets: Vec<ToolTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillsState {
    pub settings: SkillsSettings,
    pub skills: Vec<SkillRecord>,
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
            category: "未分类".to_string(),
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
            CREATE TABLE IF NOT EXISTS skill_metadata (
                directory_name TEXT PRIMARY KEY,
                category TEXT NOT NULL DEFAULT '未分类'
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
            ",
        )
        .map_err(error_message)?;
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
    let base = match project_path {
        Some(path) => PathBuf::from(path),
        None => dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?,
    };
    match (tool, project_path.is_some()) {
        ("codex", false) => Ok(base.join(".codex").join("skills")),
        ("claude", false) => Ok(base.join(".claude").join("skills")),
        ("opencode", false) => Ok(base.join(".config").join("opencode").join("skills")),
        ("codex", true) => Ok(base.join(".codex").join("skills")),
        ("claude", true) => Ok(base.join(".claude").join("skills")),
        ("opencode", true) => Ok(base.join(".opencode").join("skills")),
        _ => Err(format!("不支持的工具: {tool}")),
    }
}

fn tool_targets() -> SkillResult<Vec<ToolTarget>> {
    Ok(vec![
        target_definition("codex", "Codex")?,
        target_definition("claude", "Claude Code")?,
        target_definition("opencode", "OpenCode")?,
    ])
}

fn target_definition(key: &str, name: &str) -> SkillResult<ToolTarget> {
    let path = tool_target_path(key, None)?;
    Ok(ToolTarget {
        key: key.to_string(),
        name: name.to_string(),
        global_skills_dir: path.to_string_lossy().to_string(),
        supports_project_scope: true,
        available: path.exists(),
    })
}

fn current_settings() -> SkillResult<SkillsSettings> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let skills_root = configured_skills_root(&connection, &workbench_root)?;
    fs::create_dir_all(&skills_root).map_err(error_message)?;
    Ok(SkillsSettings {
        workbench_root: workbench_root.to_string_lossy().to_string(),
        skills_root: skills_root.to_string_lossy().to_string(),
        tool_targets: tool_targets()?,
    })
}

fn enrich_skills(
    connection: &Connection,
    mut skills: Vec<SkillRecord>,
) -> SkillResult<Vec<SkillRecord>> {
    for skill in &mut skills {
        skill.category = connection
            .query_row(
                "SELECT category FROM skill_metadata WHERE directory_name = ?1",
                [&skill.directory_name],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "未分类".to_string());

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
        for target in tool_targets()? {
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
    tool_targets()?
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
        if managed_target_is_active(&source, target, method) {
            remove_managed_target(&source, target, method)?;
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
    remove_existing_target(&source)?;
    get_skills_state()
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
pub fn set_skill_category(directory_name: String, category: String) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    connection
        .execute(
            "INSERT INTO skill_metadata(directory_name, category) VALUES(?1, ?2)
             ON CONFLICT(directory_name) DO UPDATE SET category = excluded.category",
            params![directory_name, category],
        )
        .map_err(error_message)?;
    get_skills_state()
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

fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

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
