use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

mod categories;
mod cli;
mod custom_tools;
mod db;
mod filesystem;
mod github_import;
mod importer;
mod market;
mod migration;
mod project_scope;
mod tool_targets;
mod types;

use self::categories::*;
use self::cli::*;
use self::custom_tools::*;
use self::db::*;
use self::filesystem::*;
use self::github_import::*;
use self::importer::*;
use self::market::*;
use self::migration::*;
use self::project_scope::*;
use self::tool_targets::*;
use self::types::*;

const SKILL_UPDATE_CHECK_FRESH_HOURS: i64 = 6;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillInstallProgress {
    source: String,
    skill_id: String,
    progress: u8,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillUpdateProgress {
    directory_name: String,
    progress: u8,
}

fn current_settings() -> SkillResult<SkillsSettings> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let skills_root = configured_skills_root(&connection, &workbench_root)?;
    let previous_skills_root = configured_previous_skills_root(&connection)?
        .map(|path| path.to_string_lossy().to_string());
    let github_token_configured = github_api_token_configured(&connection)?;
    fs::create_dir_all(&skills_root).map_err(error_message)?;
    Ok(SkillsSettings {
        workbench_root: workbench_root.to_string_lossy().to_string(),
        skills_root: skills_root.to_string_lossy().to_string(),
        previous_skills_root,
        tool_targets: ordered_tool_targets(&connection)?,
        close_behavior: configured_close_behavior(&connection)?,
        close_tray_hint_dismissed: configured_bool_setting(
            &connection,
            CLOSE_TRAY_HINT_DISMISSED_SETTING,
            false,
        )?,
        local_status_refresh_interval_seconds: configured_local_status_refresh_interval(
            &connection,
        )?,
        start_hidden_to_tray: configured_bool_setting(
            &connection,
            START_HIDDEN_TO_TRAY_SETTING,
            false,
        )?,
        github_token_configured,
    })
}

fn enrich_skills(
    connection: &Connection,
    mut skills: Vec<SkillRecord>,
) -> SkillResult<Vec<SkillRecord>> {
    for skill in &mut skills {
        skill.source_url = connection
            .query_row(
                "SELECT source_url FROM skill_sources WHERE directory_name = ?1",
                [&skill.directory_name],
                |row| row.get(0),
            )
            .unwrap_or_default();
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
pub fn inspect_project_skills(
    project_name: String,
    project_path: String,
) -> SkillResult<ProjectSkillsState> {
    inspect_project_skills_state(project_name, project_path)
}

#[tauri::command]
pub fn apply_project_skill_action(
    directory_name: String,
    tool: String,
    project_name: String,
    project_path: String,
    action: ProjectSkillAction,
) -> SkillResult<ProjectSkillOperationResult> {
    apply_project_skill_action_state(directory_name, tool, project_name, project_path, action)
}

#[tauri::command]
pub fn batch_enable_project_skills(
    request: ProjectSkillBatchEnableRequest,
) -> SkillResult<Vec<ProjectSkillOperationResult>> {
    batch_enable_project_skills_state(request)
}

#[tauri::command]
pub fn set_skills_root(path: String) -> SkillResult<SkillsState> {
    let root = PathBuf::from(path);
    fs::create_dir_all(&root).map_err(error_message)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let previous_root = configured_skills_root(&connection, &workbench_root)?;
    if previous_root != root {
        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES('previous_skills_root', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [previous_root.to_string_lossy().to_string()],
            )
            .map_err(error_message)?;
    }
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
pub fn set_local_status_refresh_interval(interval_seconds: u64) -> SkillResult<SkillsState> {
    if !matches!(interval_seconds, 0 | 30 | 60 | 300) {
        return Err("本机状态刷新间隔无效".to_string());
    }
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let interval_json = serde_json::to_string(&interval_seconds).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![LOCAL_STATUS_REFRESH_INTERVAL_SETTING, interval_json],
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

#[tauri::command]
pub fn set_start_hidden_to_tray(enabled: bool) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let enabled_json = serde_json::to_string(&enabled).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![START_HIDDEN_TO_TRAY_SETTING, enabled_json],
        )
        .map_err(error_message)?;
    get_skills_state()
}

#[tauri::command]
pub fn set_github_api_token(token: String) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    save_github_api_token_setting(&connection, &token)?;
    get_skills_state()
}

#[tauri::command]
pub fn clear_github_api_token() -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    clear_github_api_token_setting(&connection)?;
    get_skills_state()
}

#[tauri::command]
pub async fn test_github_api_token(token: Option<String>) -> SkillResult<GithubTokenStatus> {
    tauri::async_runtime::spawn_blocking(move || test_github_api_token_state(token))
        .await
        .map_err(error_message)?
}

#[tauri::command]
pub async fn select_tool_icon_source<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> SkillResult<Option<String>> {
    pick_tool_icon_source(app)
}

#[tauri::command]
pub fn save_custom_tool_target(input: CustomToolTargetInput) -> SkillResult<SkillsState> {
    save_custom_tool_target_state(input)
}

#[tauri::command]
pub fn delete_custom_tool_target(key: String) -> SkillResult<SkillsState> {
    delete_custom_tool_target_state(key)
}

#[tauri::command]
pub fn set_tool_target_order(tool_keys: Vec<String>) -> SkillResult<SkillsState> {
    set_tool_target_order_state(tool_keys)
}

#[tauri::command]
pub fn set_skill_category(directory_name: String, category_id: String) -> SkillResult<SkillsState> {
    set_skill_category_state(directory_name, category_id)
}

#[tauri::command]
pub fn create_skill_category(name: String) -> SkillResult<SkillsState> {
    create_skill_category_state(name)
}

#[tauri::command]
pub fn rename_skill_category(category_id: String, name: String) -> SkillResult<SkillsState> {
    rename_skill_category_state(category_id, name)
}

#[tauri::command]
pub fn delete_skill_category(
    category_id: String,
    replacement_category_id: String,
) -> SkillResult<SkillsState> {
    delete_skill_category_state(category_id, replacement_category_id)
}

#[tauri::command]
pub fn merge_skill_category(
    source_category_id: String,
    target_category_id: String,
) -> SkillResult<SkillsState> {
    merge_skill_category_state(source_category_id, target_category_id)
}

#[tauri::command]
pub fn import_skills_from_folder(
    source_path: String,
    overwrite_directory_names: Option<Vec<String>>,
) -> SkillResult<Vec<ImportResult>> {
    import_skills_from_folder_state(source_path, overwrite_directory_names)
}

#[tauri::command]
pub fn import_skills_from_zip(
    zip_path: String,
    overwrite_directory_names: Option<Vec<String>>,
) -> SkillResult<Vec<ImportResult>> {
    import_skills_from_zip_state(zip_path, overwrite_directory_names)
}

#[tauri::command]
pub async fn inspect_github_skill_import(url: String) -> SkillResult<GithubSkillImportInspection> {
    tauri::async_runtime::spawn_blocking(move || inspect_github_skill_import_state(url))
        .await
        .map_err(error_message)?
}

#[tauri::command]
pub async fn import_github_skills(
    url: String,
    selections: Vec<GithubSkillImportSelection>,
) -> SkillResult<Vec<ImportResult>> {
    tauri::async_runtime::spawn_blocking(move || import_github_skills_state(url, selections))
        .await
        .map_err(error_message)?
}

#[tauri::command]
pub async fn discover_external_skills() -> SkillResult<Vec<ExternalSkillCandidateGroup>> {
    tauri::async_runtime::spawn_blocking(discover_external_skills_state)
        .await
        .map_err(error_message)?
}

#[tauri::command]
pub async fn sync_external_skills(
    selections: Vec<ExternalSkillSyncSelection>,
) -> SkillResult<Vec<ExternalSkillSyncResult>> {
    tauri::async_runtime::spawn_blocking(move || sync_external_skills_state(selections))
        .await
        .map_err(error_message)?
}

#[tauri::command]
pub fn inspect_skills_root_migration() -> SkillResult<SkillsRootMigrationState> {
    inspect_skills_root_migration_state()
}

#[tauri::command]
pub fn migrate_skills_root(
    selections: Vec<RootSkillMigrationSelection>,
) -> SkillResult<Vec<ImportResult>> {
    migrate_skills_root_state(selections)
}

#[tauri::command]
pub fn rebuild_managed_skill_targets(
    selections: Vec<ManagedTargetRebuildSelection>,
) -> SkillResult<Vec<ManagedTargetRebuildResult>> {
    rebuild_managed_skill_targets_state(selections)
}

fn source_backup_path(
    workbench_root: &Path,
    source: &str,
    directory_name: &str,
) -> SkillResult<PathBuf> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error_message)?
        .as_secs();
    Ok(workbench_root
        .join("backups")
        .join("skills")
        .join(timestamp.to_string())
        .join(source)
        .join(directory_name))
}

#[tauri::command]
pub fn list_skill_market(
    query: Option<String>,
    limit: Option<usize>,
) -> SkillResult<SkillMarketResponse> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let normalized = query.unwrap_or_default().trim().to_lowercase();
    if normalized.is_empty() {
        let html = http_get_text("https://www.skills.sh")?;
        let mut items = parse_market_items(&html)?;
        enrich_market_items(&connection, &mut items)?;
        return Ok(leaderboard_response(items));
    }

    let bounded_limit = market_search_limit(limit);
    let mut items = fetch_market_search(&normalized, bounded_limit)?;
    enrich_market_items(&connection, &mut items)?;
    Ok(search_response(&normalized, bounded_limit, items))
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
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let target_root = PathBuf::from(&settings.skills_root);
    let target = target_root.join(&skill_id);
    if target.exists() {
        return Err("统一根目录中已存在同名 Skill，安装已停止".to_string());
    }
    let (_temporary, skill_source, relative, hash) =
        extract_skill_with_skills_cli(&source, &skill_id, on_progress)?;
    copy_to_new_target(&skill_source, &target)?;
    on_progress(92);
    let connection = open_database(&workbench_root)?;
    let record = SkillSourceRecord {
        directory_name: skill_id.clone(),
        source: "skills_sh".to_string(),
        package_slug: format!("{source}/{skill_id}"),
        repo_url: github_repository_url(&source).unwrap_or_default(),
        source_url: skills_sh_source_url(&source, &skill_id),
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

fn skills_sh_source_url(source: &str, skill_id: &str) -> String {
    format!("https://skills.sh/{source}/{skill_id}")
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
pub async fn check_skill_updates() -> SkillResult<Vec<SkillUpdateStatus>> {
    tauri::async_runtime::spawn_blocking(check_skill_updates_state)
        .await
        .map_err(error_message)?
}

fn check_skill_updates_state() -> SkillResult<Vec<SkillUpdateStatus>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let mut results = Vec::new();
    for record in list_skill_source_records(&connection)? {
        if is_recent_skill_update_check(&connection, &record.directory_name)?
            && !record.remote_ref.is_empty()
        {
            let status = cached_skill_update_state(&record);
            results.push(SkillUpdateStatus {
                name: record.directory_name.clone(),
                description: String::new(),
                source: record,
                status,
                message: cached_skill_update_message(status),
            });
            continue;
        }
        let mut next_record = record.clone();
        let (status, message) = match check_one_skill_update(&record) {
            Ok((relative, hash)) => {
                next_record.skill_path = relative;
                next_record.remote_ref = hash.clone();
                let status = if hash == record.installed_hash {
                    SkillUpdateState::UpToDate
                } else {
                    SkillUpdateState::UpdateAvailable
                };
                let message = if status == SkillUpdateState::UpToDate {
                    "已是最新".to_string()
                } else {
                    "发现可更新版本".to_string()
                };
                upsert_skill_source_record(&connection, &next_record)?;
                (status, message)
            }
            Err(error) if error == "unsupported" => (
                SkillUpdateState::Unsupported,
                "该来源不支持检查更新".to_string(),
            ),
            Err(error) => (SkillUpdateState::CheckFailed, error),
        };
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

fn check_one_skill_update(record: &SkillSourceRecord) -> SkillResult<(String, String)> {
    match record.source.as_str() {
        "skills_sh" => {
            let (source, skill_id) = record
                .package_slug
                .rsplit_once('/')
                .ok_or_else(|| "来源记录无效".to_string())?;
            let (_temporary, _skill_source, relative, hash) =
                extract_skill_with_skills_cli(source, skill_id, &|_| {})?;
            Ok((relative, hash))
        }
        "github" if github_source_is_fixed(record) => Err("unsupported".to_string()),
        "github" => {
            let (_temporary, _skill_source, relative, hash) = extract_github_remote_skill(record)?;
            Ok((relative, hash))
        }
        _ => Err("unsupported".to_string()),
    }
}

fn is_recent_skill_update_check(
    connection: &Connection,
    directory_name: &str,
) -> SkillResult<bool> {
    let window = format!("-{SKILL_UPDATE_CHECK_FRESH_HOURS} hours");
    connection
        .query_row(
            "SELECT COALESCE(
                last_checked_at != ''
                AND datetime(last_checked_at) >= datetime('now', ?1),
                0
             )
             FROM skill_sources
             WHERE directory_name = ?2",
            params![window, directory_name],
            |row| row.get::<_, bool>(0),
        )
        .map_err(error_message)
}

fn cached_skill_update_state(record: &SkillSourceRecord) -> SkillUpdateState {
    if record.remote_ref == record.installed_hash {
        SkillUpdateState::UpToDate
    } else {
        SkillUpdateState::UpdateAvailable
    }
}

fn cached_skill_update_message(status: SkillUpdateState) -> String {
    match status {
        SkillUpdateState::UpToDate => "使用最近检查结果：已是最新".to_string(),
        SkillUpdateState::UpdateAvailable => "使用最近检查结果：发现可更新版本".to_string(),
        _ => "使用最近检查结果".to_string(),
    }
}

#[tauri::command]
pub async fn update_skill_from_market(
    app: AppHandle,
    directory_name: String,
) -> SkillResult<SkillUpdateResult> {
    tauri::async_runtime::spawn_blocking(move || {
        update_skill_from_market_state(directory_name, &|directory_name, progress| {
            let _ = app.emit(
                "skill-update-progress",
                SkillUpdateProgress {
                    directory_name: directory_name.to_string(),
                    progress,
                },
            );
        })
    })
    .await
    .map_err(error_message)?
}

fn update_skill_from_market_state(
    directory_name: String,
    on_progress: &dyn Fn(&str, u8),
) -> SkillResult<SkillUpdateResult> {
    validate_directory_name(&directory_name)?;
    on_progress(&directory_name, 8);
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    let record = source_record_for_directory(&connection, &directory_name)?;
    let (_temporary, remote_skill, relative, hash) =
        extract_remote_skill_for_update(&record, &directory_name, on_progress)?;
    if hash == record.installed_hash {
        on_progress(&directory_name, 100);
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
    let backup = source_backup_path(&workbench_root, &record.source, &record.directory_name)?;
    on_progress(&directory_name, 82);
    copy_path_to_backup(&target, &backup)?;
    on_progress(&directory_name, 92);
    replace_directory_from(&remote_skill, &target)?;
    let next_record = SkillSourceRecord {
        installed_ref: hash.clone(),
        installed_hash: hash.clone(),
        remote_ref: hash,
        skill_path: relative,
        ..record
    };
    upsert_skill_source_record(&connection, &next_record)?;
    on_progress(&directory_name, 100);
    Ok(SkillUpdateResult {
        directory_name: next_record.directory_name,
        status: SkillUpdateState::UpToDate,
        message: format!("已更新，旧版本已备份到 {}", backup.to_string_lossy()),
    })
}

fn extract_remote_skill_for_update(
    record: &SkillSourceRecord,
    directory_name: &str,
    on_progress: &dyn Fn(&str, u8),
) -> SkillResult<(tempfile::TempDir, PathBuf, String, String)> {
    match record.source.as_str() {
        "skills_sh" => {
            let (source, skill_id) = record
                .package_slug
                .rsplit_once('/')
                .ok_or_else(|| "来源记录无效".to_string())?;
            let progress_directory_name = directory_name.to_string();
            extract_skill_with_skills_cli(source, skill_id, &|progress| {
                on_progress(&progress_directory_name, progress);
            })
        }
        "github" if github_source_is_fixed(record) => {
            Err("GitHub 固定版本来源不支持更新".to_string())
        }
        "github" => {
            on_progress(directory_name, 45);
            let result = extract_github_remote_skill(record);
            on_progress(directory_name, 72);
            result
        }
        _ => Err("该来源不支持更新".to_string()),
    }
}

#[tauri::command]
pub async fn update_market_skills(
    app: AppHandle,
    directory_names: Vec<String>,
) -> SkillResult<Vec<SkillUpdateResult>> {
    tauri::async_runtime::spawn_blocking(move || {
        update_market_skills_state(directory_names, &|directory_name, progress| {
            let _ = app.emit(
                "skill-update-progress",
                SkillUpdateProgress {
                    directory_name: directory_name.to_string(),
                    progress,
                },
            );
        })
    })
    .await
    .map_err(error_message)?
}

fn update_market_skills_state(
    directory_names: Vec<String>,
    on_progress: &dyn Fn(&str, u8),
) -> SkillResult<Vec<SkillUpdateResult>> {
    let mut results = Vec::new();
    for directory_name in directory_names {
        match update_skill_from_market_state(directory_name.clone(), on_progress) {
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
    use std::io;
    use tempfile::tempdir;
    use walkdir::WalkDir;

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
    fn parses_skills_sh_search_response() {
        let body = r#"
            {"query":"react","skills":[
              {"id":"vercel-labs/agent-skills/vercel-react-best-practices","source":"vercel-labs/agent-skills","skillId":"vercel-react-best-practices","name":"Vercel React","description":"React patterns","installs":498380,"isOfficial":true},
              {"id":"skills.volces.com/byted-web-search","source":"skills.volces.com","skillId":"byted-web-search","name":"byted-web-search","installs":25028}
            ],"count":2}
        "#;

        let items = parse_market_search_response(body).unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].source, "vercel-labs/agent-skills");
        assert_eq!(items[0].skill_id, "vercel-react-best-practices");
        assert_eq!(items[0].description, "React patterns");
        assert!(items[0].official);
        assert!(items[0].installable);
        assert!(!items[1].installable);
    }

    #[test]
    fn market_search_limit_is_bounded() {
        assert_eq!(market_search_limit(None), MARKET_SEARCH_DEFAULT_LIMIT);
        assert_eq!(market_search_limit(Some(0)), 1);
        assert_eq!(market_search_limit(Some(60)), 60);
        assert_eq!(
            market_search_limit(Some(MARKET_SEARCH_MAX_LIMIT + 1)),
            MARKET_SEARCH_MAX_LIMIT
        );
    }

    #[test]
    fn market_search_response_reports_more_until_cap() {
        let items = vec![SkillMarketItem {
            source: "vercel-labs/skills".to_string(),
            skill_id: "find-skills".to_string(),
            name: "find-skills".to_string(),
            description: String::new(),
            installs: 1,
            official: false,
            installed_directory_name: None,
            update_status: SkillUpdateState::NotInstalled,
            installable: true,
        }];

        let response = search_response("skill", 1, items.clone());
        assert!(response.has_more);
        assert_eq!(response.loaded, 1);

        let capped = search_response("skill", MARKET_SEARCH_MAX_LIMIT, items);
        assert!(!capped.has_more);
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
    fn cleans_noisy_skills_cli_failure_output() {
        let output = clean_skills_cli_output(
            "\u{1b}[38;5;250mFetching skills.\u{1b}[0m\r\
             \u{1b}[38;5;250mFetching skills.\u{1b}[0m\n\
             \u{1b}[31mSource: https://github.com/vercel-labs/agent-browser.git\u{1b}[0m",
        );

        assert!(!output.contains("\u{1b}"));
        assert!(!output.contains('\r'));
        assert_eq!(output.matches("Fetching skills.").count(), 1);
        assert!(output.contains("Source: https://github.com/vercel-labs/agent-browser.git"));
    }

    #[test]
    fn recent_skill_update_check_uses_sqlite_timestamp_window() {
        let root = tempdir().unwrap();
        let connection = open_database(root.path()).unwrap();
        let record = SkillSourceRecord {
            directory_name: "frontend-design".to_string(),
            source: "skills_sh".to_string(),
            package_slug: "anthropics/skills/frontend-design".to_string(),
            repo_url: "https://github.com/anthropics/skills".to_string(),
            source_url: String::new(),
            skill_path: ".agents/skills/frontend-design".to_string(),
            installed_ref: "local".to_string(),
            installed_hash: "local".to_string(),
            remote_ref: "remote".to_string(),
            last_checked_at: String::new(),
            installed_at: String::new(),
            updated_at: String::new(),
        };
        upsert_skill_source_record(&connection, &record).unwrap();

        assert!(is_recent_skill_update_check(&connection, "frontend-design").unwrap());

        connection
            .execute(
                "UPDATE skill_sources
                 SET last_checked_at = datetime('now', '-7 hours')
                 WHERE directory_name = 'frontend-design'",
                [],
            )
            .unwrap();

        assert!(!is_recent_skill_update_check(&connection, "frontend-design").unwrap());
    }

    #[test]
    fn cached_skill_update_state_compares_remote_and_installed_hashes() {
        let mut record = SkillSourceRecord {
            directory_name: "frontend-design".to_string(),
            source: "skills_sh".to_string(),
            package_slug: "anthropics/skills/frontend-design".to_string(),
            repo_url: "https://github.com/anthropics/skills".to_string(),
            source_url: String::new(),
            skill_path: ".agents/skills/frontend-design".to_string(),
            installed_ref: "same".to_string(),
            installed_hash: "same".to_string(),
            remote_ref: "same".to_string(),
            last_checked_at: String::new(),
            installed_at: String::new(),
            updated_at: String::new(),
        };

        assert_eq!(
            cached_skill_update_state(&record),
            SkillUpdateState::UpToDate
        );

        record.remote_ref = "different".to_string();

        assert_eq!(
            cached_skill_update_state(&record),
            SkillUpdateState::UpdateAvailable
        );
    }

    #[test]
    fn github_fixed_sources_are_not_updateable() {
        let record = SkillSourceRecord {
            directory_name: "github-fixed".to_string(),
            source: "github".to_string(),
            package_slug: "owner/repo/github-fixed".to_string(),
            repo_url: "https://github.com/owner/repo".to_string(),
            source_url: String::new(),
            skill_path: "github-fixed".to_string(),
            installed_ref: "tag:v1.0.0@abc".to_string(),
            installed_hash: "local".to_string(),
            remote_ref: "local".to_string(),
            last_checked_at: String::new(),
            installed_at: String::new(),
            updated_at: String::new(),
        };

        assert_eq!(
            check_one_skill_update(&record),
            Err("unsupported".to_string())
        );
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
            source_url: "https://skills.sh/vercel-labs/next-skills/next-upgrade".to_string(),
        };

        upsert_skill_source_record(&connection, &record).unwrap();
        let records = list_skill_source_records(&connection).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].directory_name, "next-upgrade");
        assert_eq!(
            records[0].repo_url,
            "https://github.com/vercel-labs/next-skills"
        );
        assert_eq!(records[0].source_url, record.source_url);
    }

    #[test]
    fn builds_skills_sh_detail_urls_from_the_installed_market_identity() {
        assert_eq!(
            skills_sh_source_url("vercel-labs/skills", "find-skills"),
            "https://skills.sh/vercel-labs/skills/find-skills"
        );
    }

    #[test]
    fn does_not_backfill_source_url_when_updating_a_historical_skill_source() {
        let connection = Connection::open_in_memory().unwrap();
        ensure_skill_source_schema(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO skill_sources(
                    directory_name, source, package_slug, repo_url, skill_path, installed_ref,
                    installed_hash, remote_ref
                 ) VALUES(
                    'historical', 'github', 'owner/repo/historical',
                    'https://github.com/owner/repo', 'historical', 'branch:main@abc',
                    'local', 'local'
                 )",
                [],
            )
            .unwrap();
        let mut record = source_record_for_directory(&connection, "historical").unwrap();
        assert!(record.source_url.is_empty());

        record.source_url = "https://github.com/owner/repo/tree/abc/historical".to_string();
        record.remote_ref = "remote".to_string();
        upsert_skill_source_record(&connection, &record).unwrap();

        let persisted = source_record_for_directory(&connection, "historical").unwrap();
        assert!(persisted.source_url.is_empty());
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
    fn resolves_registered_project_tool_paths_for_all_builtins() {
        assert!(TOOL_TARGET_DEFINITIONS
            .iter()
            .all(|definition| definition.project_path.is_some()));

        assert!(tool_target_path("deveco", Some("E:\\Project"))
            .unwrap()
            .ends_with(Path::new(".deveco").join("skills")));
        assert!(tool_target_path("kimi", Some("E:\\Project"))
            .unwrap()
            .ends_with(Path::new(".kimi-code").join("skills")));
        assert!(tool_target_path("goose", Some("E:\\Project"))
            .unwrap()
            .ends_with(Path::new(".goose").join("skills")));
    }

    #[test]
    fn rejects_project_scope_for_unknown_or_custom_tools() {
        let result = tool_target_path("custom-agent", Some("E:\\Project"));

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
    fn discovers_skills_from_registered_custom_tool_targets() {
        let root = tempdir().unwrap();
        let tool_root = root.path().join("tool-skills");
        let skill = tool_root.join("external-skill");
        fs::create_dir_all(&skill).unwrap();
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: External Skill\ndescription: From tool\n---\n",
        )
        .unwrap();
        let skills_root = root.path().join("workbench-skills");
        fs::create_dir_all(&skills_root).unwrap();
        let connection = in_memory_settings_connection();
        connection
            .execute(
                "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
                 VALUES('my-tool', 'My Tool', ?1, '')",
                [tool_root.to_string_lossy().to_string()],
            )
            .unwrap();

        let candidates = discover_external_skills_in(&connection, &skills_root).unwrap();
        let candidate = candidates
            .iter()
            .find(|candidate| candidate.directory_name == "external-skill")
            .unwrap();

        assert_eq!(candidate.status, ExternalSkillCandidateStatus::New);
        assert_eq!(candidate.display_name, "External Skill");
        assert_eq!(candidate.sources[0].tool, "my-tool");
    }

    #[test]
    fn marks_same_named_external_candidates_with_different_content_as_conflict() {
        let root = tempdir().unwrap();
        let first_root = root.path().join("first-tool");
        let second_root = root.path().join("second-tool");
        let first_skill = first_root.join("shared");
        let second_skill = second_root.join("shared");
        fs::create_dir_all(&first_skill).unwrap();
        fs::create_dir_all(&second_skill).unwrap();
        fs::write(first_skill.join("SKILL.md"), "first").unwrap();
        fs::write(second_skill.join("SKILL.md"), "second").unwrap();
        let skills_root = root.path().join("workbench-skills");
        fs::create_dir_all(&skills_root).unwrap();
        let connection = in_memory_settings_connection();
        connection
            .execute(
                "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
                 VALUES('first-tool', 'First Tool', ?1, ''), ('second-tool', 'Second Tool', ?2, '')",
                params![
                    first_root.to_string_lossy().to_string(),
                    second_root.to_string_lossy().to_string()
                ],
            )
            .unwrap();

        let candidates = discover_external_skills_in(&connection, &skills_root).unwrap();
        let candidate = candidates
            .iter()
            .find(|candidate| candidate.directory_name == "shared")
            .unwrap();

        assert_eq!(candidate.status, ExternalSkillCandidateStatus::Conflict);
        assert_eq!(candidate.sources.len(), 2);
    }

    #[test]
    fn root_migration_skips_same_content_and_conflicts_different_content() {
        let root = tempdir().unwrap();
        let previous_root = root.path().join("old");
        let current_root = root.path().join("new");
        let same_old = previous_root.join("same");
        let same_new = current_root.join("same");
        let changed_old = previous_root.join("changed");
        let changed_new = current_root.join("changed");
        fs::create_dir_all(&same_old).unwrap();
        fs::create_dir_all(&same_new).unwrap();
        fs::create_dir_all(&changed_old).unwrap();
        fs::create_dir_all(&changed_new).unwrap();
        fs::write(same_old.join("SKILL.md"), "same").unwrap();
        fs::write(same_new.join("SKILL.md"), "same").unwrap();
        fs::write(changed_old.join("SKILL.md"), "old").unwrap();
        fs::write(changed_new.join("SKILL.md"), "new").unwrap();

        let same = import_skill_directory_allow_skipped(&same_old, &current_root).unwrap();
        let changed = import_skill_directory_allow_skipped(&changed_old, &current_root).unwrap();

        assert_eq!(same.status, ImportStatus::Skipped);
        assert_eq!(changed.status, ImportStatus::Conflict);
        assert_eq!(
            fs::read_to_string(changed_new.join("SKILL.md")).unwrap(),
            "new"
        );
    }

    #[test]
    fn rebuild_managed_copy_repoints_to_current_root_content() {
        let root = tempdir().unwrap();
        let workbench_root = root.path().join("workbench");
        let connection = open_database(&workbench_root).unwrap();
        let previous_root = root.path().join("old");
        let current_root = root.path().join("new");
        let previous_skill = previous_root.join("shared");
        let current_skill = current_root.join("shared");
        let target = root.path().join("tool").join("shared");
        fs::create_dir_all(&previous_skill).unwrap();
        fs::create_dir_all(&current_skill).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(previous_skill.join("SKILL.md"), "old").unwrap();
        fs::write(current_skill.join("SKILL.md"), "new").unwrap();
        fs::write(target.join("SKILL.md"), "old").unwrap();
        connection
            .execute(
                "INSERT INTO skill_enablements(directory_name, tool, scope, project_name, project_path, link_path, sync_method)
                 VALUES('shared', 'codex', 'global', '', '', ?1, 'copy')",
                [target.to_string_lossy().to_string()],
            )
            .unwrap();
        let settings = SkillsSettings {
            workbench_root: workbench_root.to_string_lossy().to_string(),
            skills_root: current_root.to_string_lossy().to_string(),
            previous_skills_root: Some(previous_root.to_string_lossy().to_string()),
            tool_targets: Vec::new(),
            close_behavior: CloseBehavior::HideToTray,
            close_tray_hint_dismissed: false,
            local_status_refresh_interval_seconds: 60,
            start_hidden_to_tray: false,
            github_token_configured: false,
        };

        let candidates = managed_target_rebuild_candidates(&connection, &settings).unwrap();
        assert_eq!(candidates[0].status, ManagedTargetRebuildStatus::Ready);
        let result = rebuild_managed_skill_target(
            &connection,
            &settings,
            &ManagedTargetRebuildSelection {
                directory_name: "shared".to_string(),
                tool: "codex".to_string(),
                scope: "global".to_string(),
                project_path: String::new(),
            },
        )
        .unwrap();

        assert_eq!(result.status, ManagedTargetRebuildStatus::Rebuilt);
        assert_eq!(fs::read_to_string(target.join("SKILL.md")).unwrap(), "new");
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
    fn local_status_refresh_interval_defaults_to_one_minute() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();

        let interval = configured_local_status_refresh_interval(&connection).unwrap();

        assert_eq!(interval, 60);
    }

    #[test]
    fn local_status_refresh_interval_reads_allowed_value() {
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
                params![LOCAL_STATUS_REFRESH_INTERVAL_SETTING, "300"],
            )
            .unwrap();

        let interval = configured_local_status_refresh_interval(&connection).unwrap();

        assert_eq!(interval, 300);
    }

    #[test]
    fn local_status_refresh_interval_rejects_unbounded_values() {
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
                params![LOCAL_STATUS_REFRESH_INTERVAL_SETTING, "1"],
            )
            .unwrap();

        let error = configured_local_status_refresh_interval(&connection).unwrap_err();

        assert_eq!(error, "本机状态刷新间隔无效");
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
        assert!(
            !configured_bool_setting(&connection, START_HIDDEN_TO_TRAY_SETTING, false).unwrap()
        );

        connection
            .execute(
                "INSERT INTO app_settings(key, value) VALUES(?1, ?2)",
                params![START_HIDDEN_TO_TRAY_SETTING, "true"],
            )
            .unwrap();

        assert!(configured_bool_setting(&connection, START_HIDDEN_TO_TRAY_SETTING, false).unwrap());
    }

    #[test]
    fn github_api_token_setting_never_reads_blank_as_configured() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute(
                "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();

        assert!(!github_api_token_configured(&connection).unwrap());
        save_github_api_token_setting(&connection, "  ghp_preview  ").unwrap();
        assert_eq!(
            configured_github_api_token(&connection).unwrap(),
            Some("ghp_preview".to_string())
        );
        assert!(github_api_token_configured(&connection).unwrap());

        save_github_api_token_setting(&connection, "   ").unwrap();

        assert_eq!(configured_github_api_token(&connection).unwrap(), None);
        assert!(!github_api_token_configured(&connection).unwrap());
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
    fn importing_same_directory_name_with_overwrite_replaces_and_backs_up() {
        let source_root = tempdir().unwrap();
        let target_root = tempdir().unwrap();
        let workbench_root = tempdir().unwrap();
        let source = source_root.path().join("shared");
        let target = target_root.path().join("shared");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("SKILL.md"), "new").unwrap();
        fs::write(target.join("SKILL.md"), "existing").unwrap();

        let result = import_skill_directory_with_overwrite(
            &source,
            target_root.path(),
            true,
            workbench_root.path(),
        )
        .unwrap();

        assert_eq!(result.status, ImportStatus::Imported);
        assert_eq!(fs::read_to_string(target.join("SKILL.md")).unwrap(), "new");
        let backup_root = workbench_root.path().join("backups/skills");
        let backup = WalkDir::new(backup_root)
            .into_iter()
            .filter_map(Result::ok)
            .find(|entry| entry.file_name() == "SKILL.md")
            .expect("old Skill should be backed up");
        assert_eq!(fs::read_to_string(backup.path()).unwrap(), "existing");
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

    #[test]
    fn syncing_external_skill_imports_backs_up_and_takes_over_tool_target() {
        let root = tempdir().unwrap();
        let workbench_root = root.path().join("workbench");
        let skills_root = workbench_root.join("skills");
        let tool_root = root.path().join("tool-skills");
        let tool_skill = tool_root.join("external-skill");
        fs::create_dir_all(&tool_skill).unwrap();
        fs::write(tool_skill.join("SKILL.md"), "# External").unwrap();

        let connection = open_database(&workbench_root).unwrap();
        connection
            .execute(
                "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
                 VALUES('my-agent', 'My Agent', ?1, '')",
                [tool_root.to_string_lossy().to_string()],
            )
            .unwrap();

        let results = sync_external_skills_in(
            &connection,
            &workbench_root,
            &skills_root,
            vec![ExternalSkillSyncSelection {
                directory_name: "external-skill".to_string(),
                source_path: tool_skill.to_string_lossy().to_string(),
                tool: "my-agent".to_string(),
                action: ExternalSkillSyncAction::Sync,
            }],
        )
        .unwrap();

        assert_eq!(results[0].status, ExternalSkillSyncStatus::Synced);
        assert!(results[0].backup_path.is_some());
        assert_eq!(
            fs::read_to_string(skills_root.join("external-skill").join("SKILL.md")).unwrap(),
            "# External"
        );
        assert_eq!(
            fs::read_to_string(tool_skill.join("SKILL.md")).unwrap(),
            "# External"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM skill_enablements
                     WHERE directory_name = 'external-skill' AND tool = 'my-agent'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert!(PathBuf::from(results[0].backup_path.as_ref().unwrap())
            .join("SKILL.md")
            .is_file());
    }

    #[test]
    fn syncing_same_content_external_skill_skips_without_taking_over_tool_target() {
        let root = tempdir().unwrap();
        let workbench_root = root.path().join("workbench");
        let skills_root = workbench_root.join("skills");
        let workbench_skill = skills_root.join("shared");
        let tool_root = root.path().join("tool-skills");
        let tool_skill = tool_root.join("shared");
        fs::create_dir_all(&workbench_skill).unwrap();
        fs::create_dir_all(&tool_skill).unwrap();
        fs::write(workbench_skill.join("SKILL.md"), "# Shared").unwrap();
        fs::write(tool_skill.join("SKILL.md"), "# Shared").unwrap();

        let connection = open_database(&workbench_root).unwrap();
        connection
            .execute(
                "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
                 VALUES('my-agent', 'My Agent', ?1, '')",
                [tool_root.to_string_lossy().to_string()],
            )
            .unwrap();

        let results = sync_external_skills_in(
            &connection,
            &workbench_root,
            &skills_root,
            vec![ExternalSkillSyncSelection {
                directory_name: "shared".to_string(),
                source_path: tool_skill.to_string_lossy().to_string(),
                tool: "my-agent".to_string(),
                action: ExternalSkillSyncAction::Sync,
            }],
        )
        .unwrap();

        assert_eq!(results[0].status, ExternalSkillSyncStatus::Skipped);
        assert!(results[0].backup_path.is_none());
        assert_eq!(
            fs::read_to_string(tool_skill.join("SKILL.md")).unwrap(),
            "# Shared"
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM skill_enablements", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn syncing_conflicting_external_skill_requires_version_choice() {
        let root = tempdir().unwrap();
        let workbench_root = root.path().join("workbench");
        let skills_root = workbench_root.join("skills");
        let workbench_skill = skills_root.join("shared");
        let tool_root = root.path().join("tool-skills");
        let tool_skill = tool_root.join("shared");
        fs::create_dir_all(&workbench_skill).unwrap();
        fs::create_dir_all(&tool_skill).unwrap();
        fs::write(workbench_skill.join("SKILL.md"), "workbench").unwrap();
        fs::write(tool_skill.join("SKILL.md"), "external").unwrap();

        let connection = open_database(&workbench_root).unwrap();
        connection
            .execute(
                "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
                 VALUES('my-agent', 'My Agent', ?1, '')",
                [tool_root.to_string_lossy().to_string()],
            )
            .unwrap();

        let results = sync_external_skills_in(
            &connection,
            &workbench_root,
            &skills_root,
            vec![ExternalSkillSyncSelection {
                directory_name: "shared".to_string(),
                source_path: tool_skill.to_string_lossy().to_string(),
                tool: "my-agent".to_string(),
                action: ExternalSkillSyncAction::Sync,
            }],
        )
        .unwrap();

        assert_eq!(results[0].status, ExternalSkillSyncStatus::Conflict);
        assert_eq!(
            fs::read_to_string(workbench_skill.join("SKILL.md")).unwrap(),
            "workbench"
        );
        assert_eq!(
            fs::read_to_string(tool_skill.join("SKILL.md")).unwrap(),
            "external"
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM skill_enablements", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
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
