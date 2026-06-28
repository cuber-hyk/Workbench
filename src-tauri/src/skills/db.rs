use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use super::{
    error_message, CloseBehavior, SkillResult, UNCATEGORIZED_CATEGORY_ID,
    UNCATEGORIZED_CATEGORY_NAME,
};

pub(super) const CLOSE_BEHAVIOR_SETTING: &str = "close_behavior";
pub(super) const CLOSE_TRAY_HINT_DISMISSED_SETTING: &str = "close_tray_hint_dismissed";
pub(super) const START_HIDDEN_TO_TRAY_SETTING: &str = "start_hidden_to_tray";

pub(super) fn default_workbench_root() -> SkillResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".workbench"))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}

fn database_path(workbench_root: &Path) -> PathBuf {
    workbench_root.join("workbench.sqlite")
}

pub(super) fn open_database(workbench_root: &Path) -> SkillResult<Connection> {
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

pub(super) fn ensure_skill_source_schema(connection: &Connection) -> SkillResult<()> {
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

pub(super) fn ensure_skill_category_schema(connection: &Connection) -> SkillResult<()> {
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

pub(super) fn table_has_column(
    connection: &Connection,
    table: &str,
    column: &str,
) -> SkillResult<bool> {
    Ok(connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(error_message)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(error_message)?
        .filter_map(Result::ok)
        .any(|value| value == column))
}

pub(super) fn normalize_category_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        UNCATEGORIZED_CATEGORY_NAME.to_string()
    } else {
        trimmed.to_string()
    }
}

pub(super) fn category_id_for_name(name: &str) -> String {
    if name == UNCATEGORIZED_CATEGORY_NAME {
        return UNCATEGORIZED_CATEGORY_ID.to_string();
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    name.hash(&mut hasher);
    format!("category-{:016x}", hasher.finish())
}

pub(super) fn ensure_category_exists(
    connection: &Connection,
    id: &str,
    name: &str,
) -> SkillResult<()> {
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

pub(super) fn configured_skills_root(
    connection: &Connection,
    workbench_root: &Path,
) -> SkillResult<PathBuf> {
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

pub(super) fn configured_previous_skills_root(
    connection: &Connection,
) -> SkillResult<Option<PathBuf>> {
    let configured = connection.query_row(
        "SELECT value FROM app_settings WHERE key = 'previous_skills_root'",
        [],
        |row| row.get::<_, String>(0),
    );
    match configured {
        Ok(path) if path.trim().is_empty() => Ok(None),
        Ok(path) => Ok(Some(PathBuf::from(path))),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub(super) fn configured_close_behavior(connection: &Connection) -> SkillResult<CloseBehavior> {
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

pub(super) fn configured_bool_setting(
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
