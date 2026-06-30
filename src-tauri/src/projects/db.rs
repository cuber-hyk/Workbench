use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;

use super::error_message;
use super::profiles::{default_project_open_profiles, project_open_profile_kind_name};
use super::types::{
    ProjectLaunchConfig, ProjectOpenProfile, ProjectOpenProfileKind, ProjectRecord,
};
use super::ProjectResult;

pub(crate) fn open_database(workbench_root: &Path) -> ProjectResult<Connection> {
    fs::create_dir_all(workbench_root).map_err(error_message)?;
    let connection =
        Connection::open(workbench_root.join("workbench.sqlite")).map_err(error_message)?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                source_url TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                launch_command TEXT NOT NULL DEFAULT '',
                launch_workdir TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'missing-command',
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS project_launch_configs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                workdir TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_open_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                command TEXT NOT NULL,
                executable_path TEXT NOT NULL DEFAULT '',
                args_json TEXT NOT NULL DEFAULT '[]',
                workdir TEXT NOT NULL DEFAULT '{projectPath}',
                enabled INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            ",
        )
        .map_err(error_message)?;
    ensure_column(
        &connection,
        "projects",
        "archived",
        "ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &connection,
        "projects",
        "source_url",
        "ALTER TABLE projects ADD COLUMN source_url TEXT NOT NULL DEFAULT ''",
    )?;
    migrate_legacy_launch_configs(&connection)?;
    seed_default_project_open_profiles(&connection)?;
    Ok(connection)
}

pub(crate) fn load_projects(connection: &Connection) -> ProjectResult<Vec<ProjectRecord>> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, path, source_url, note, tags_json, archived
            FROM projects
            ORDER BY lower(name)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(5)?;
            let id: String = row.get(0)?;
            Ok(ProjectRecord {
                launch_configs: load_launch_configs(connection, &id).unwrap_or_default(),
                id,
                name: row.get(1)?,
                path: row.get(2)?,
                source_url: row.get(3)?,
                note: row.get(4)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                archived: row.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(error_message)?;

    let mut projects = Vec::new();
    for row in rows {
        projects.push(row.map_err(error_message)?);
    }
    Ok(projects)
}

pub(crate) fn upsert_project(
    connection: &Connection,
    project: &ProjectRecord,
) -> ProjectResult<()> {
    let tags_json = serde_json::to_string(&project.tags).map_err(error_message)?;
    let transaction = connection.unchecked_transaction().map_err(error_message)?;
    transaction
        .execute(
            "
            INSERT INTO projects(id, name, path, source_url, note, tags_json, archived)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                path = excluded.path,
                note = excluded.note,
                tags_json = excluded.tags_json,
                archived = excluded.archived,
                updated_at = strftime('%s','now')
            ",
            params![
                project.id,
                project.name,
                project.path,
                project.source_url,
                project.note,
                tags_json,
                if project.archived { 1_i64 } else { 0_i64 }
            ],
        )
        .map_err(error_message)?;
    transaction
        .execute(
            "DELETE FROM project_launch_configs WHERE project_id = ?1",
            params![project.id],
        )
        .map_err(error_message)?;
    for (index, config) in project.launch_configs.iter().enumerate() {
        transaction
            .execute(
                "
                INSERT INTO project_launch_configs(id, project_id, name, command, workdir, enabled, sort_order)
                VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ",
                params![
                    config.id,
                    project.id,
                    config.name,
                    config.command,
                    config.workdir,
                    if config.enabled { 1_i64 } else { 0_i64 },
                    index as i64
                ],
            )
            .map_err(error_message)?;
    }
    transaction.commit().map_err(error_message)?;
    Ok(())
}

pub(crate) fn delete_project(connection: &Connection, project_id: &str) -> ProjectResult<()> {
    if project_id.trim().is_empty() {
        return Err("项目 ID 不能为空".to_string());
    }
    connection
        .execute("PRAGMA foreign_keys = ON", [])
        .map_err(error_message)?;
    connection
        .execute("DELETE FROM projects WHERE id = ?1", params![project_id])
        .map_err(error_message)?;
    Ok(())
}

pub(crate) fn load_project_open_profiles(
    connection: &Connection,
) -> ProjectResult<Vec<ProjectOpenProfile>> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, kind, command, executable_path, args_json, workdir, enabled, sort_order
            FROM project_open_profiles
            ORDER BY sort_order, lower(name)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let kind: String = row.get(2)?;
            let args_json: String = row.get(5)?;
            let kind = match kind.as_str() {
                "app" => ProjectOpenProfileKind::App,
                "terminal" => ProjectOpenProfileKind::Terminal,
                _ => ProjectOpenProfileKind::App,
            };
            Ok(ProjectOpenProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                kind,
                command: row.get(3)?,
                executable_path: row.get(4)?,
                args: serde_json::from_str(&args_json).unwrap_or_default(),
                workdir: row.get(6)?,
                enabled: row.get::<_, i64>(7)? != 0,
                sort_order: row.get(8)?,
            })
        })
        .map_err(error_message)?;
    let mut profiles = Vec::new();
    for row in rows {
        profiles.push(row.map_err(error_message)?);
    }
    Ok(profiles)
}

pub(crate) fn upsert_project_open_profile(
    connection: &Connection,
    profile: &ProjectOpenProfile,
) -> ProjectResult<()> {
    let args_json = serde_json::to_string(&profile.args).map_err(error_message)?;
    connection
        .execute(
            "
            INSERT INTO project_open_profiles(id, name, kind, command, executable_path, args_json, workdir, enabled, sort_order)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                kind = excluded.kind,
                command = excluded.command,
                executable_path = excluded.executable_path,
                args_json = excluded.args_json,
                workdir = excluded.workdir,
                enabled = excluded.enabled,
                sort_order = excluded.sort_order
            ",
            params![
                profile.id,
                profile.name,
                project_open_profile_kind_name(&profile.kind),
                profile.command,
                profile.executable_path,
                args_json,
                profile.workdir,
                if profile.enabled { 1_i64 } else { 0_i64 },
                profile.sort_order
            ],
        )
        .map_err(error_message)?;
    Ok(())
}

pub(crate) fn delete_project_open_profile(connection: &Connection, id: &str) -> ProjectResult<()> {
    connection
        .execute(
            "DELETE FROM project_open_profiles WHERE id = ?1",
            params![id],
        )
        .map_err(error_message)?;
    Ok(())
}

pub(crate) fn seed_default_project_open_profiles(connection: &Connection) -> ProjectResult<()> {
    let seeded: Option<String> = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'project_open_profiles_seeded'",
            [],
            |row| row.get(0),
        )
        .ok();
    if seeded.as_deref() == Some("true") {
        return Ok(());
    }
    for profile in default_project_open_profiles() {
        upsert_project_open_profile(connection, &profile)?;
    }
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES('project_open_profiles_seeded', 'true')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(error_message)?;
    Ok(())
}

pub(crate) fn validate_project(project: &ProjectRecord) -> ProjectResult<()> {
    if project.id.trim().is_empty() {
        return Err("项目 ID 不能为空".to_string());
    }
    if project.name.trim().is_empty() {
        return Err("项目名称不能为空".to_string());
    }
    if project.path.trim().is_empty() {
        return Err("项目路径不能为空".to_string());
    }
    for config in &project.launch_configs {
        if config.id.trim().is_empty() {
            return Err("启动项 ID 不能为空".to_string());
        }
        if config.name.trim().is_empty() {
            return Err("启动项名称不能为空".to_string());
        }
    }
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    alter_statement: &str,
) -> ProjectResult<()> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(error_message)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(error_message)?;
    for existing_column in columns {
        if existing_column.map_err(error_message)? == column {
            return Ok(());
        }
    }
    connection
        .execute(alter_statement, [])
        .map_err(error_message)?;
    Ok(())
}

fn load_launch_configs(
    connection: &Connection,
    project_id: &str,
) -> ProjectResult<Vec<ProjectLaunchConfig>> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, command, workdir, enabled
            FROM project_launch_configs
            WHERE project_id = ?1
            ORDER BY sort_order, lower(name)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map(params![project_id], |row| {
            Ok(ProjectLaunchConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                workdir: row.get(3)?,
                enabled: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(error_message)?;
    let mut configs = Vec::new();
    for row in rows {
        configs.push(row.map_err(error_message)?);
    }
    Ok(configs)
}

pub(crate) fn migrate_legacy_launch_configs(connection: &Connection) -> ProjectResult<()> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, launch_command, launch_workdir, path
            FROM projects
            WHERE trim(launch_command) <> ''
              AND id NOT IN (SELECT DISTINCT project_id FROM project_launch_configs)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(error_message)?;

    let mut legacy_projects = Vec::new();
    for row in rows {
        legacy_projects.push(row.map_err(error_message)?);
    }
    drop(statement);

    for (project_id, project_name, command, workdir, path) in legacy_projects {
        connection
            .execute(
                "
                INSERT INTO project_launch_configs(id, project_id, name, command, workdir, enabled, sort_order)
                VALUES(?1, ?2, ?3, ?4, ?5, 1, 0)
                ",
                params![
                    format!("{project_id}-default"),
                    project_id,
                    project_name,
                    command,
                    if workdir.trim().is_empty() { path } else { workdir }
                ],
            )
            .map_err(error_message)?;
    }
    Ok(())
}
