use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use tauri_plugin_dialog::DialogExt;

type ProjectResult<T> = Result<T, String>;

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

#[tauri::command]
pub fn list_projects() -> ProjectResult<Vec<ProjectRecord>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    load_projects(&connection)
}

#[tauri::command]
pub fn save_project(project: ProjectRecord) -> ProjectResult<Vec<ProjectRecord>> {
    validate_project(&project)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    upsert_project(&connection, &project)?;
    load_projects(&connection)
}

#[tauri::command]
pub fn launch_project(name: String, launch_configs: Vec<ProjectLaunchConfig>) -> ProjectResult<()> {
    let enabled_configs = enabled_launch_configs(&launch_configs);
    if enabled_configs.is_empty() {
        return Err("没有可启动的启用项".to_string());
    }
    for config in &enabled_configs {
        validate_launch_request(&config.command, &config.workdir)?;
    }
    for config in enabled_configs {
        launch_in_terminal(
            &format!("{name} - {}", config.name),
            &config.command,
            &config.workdir,
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn select_directory<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> ProjectResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| path.to_string()))
}

fn default_workbench_root() -> ProjectResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".workbench"))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}

fn open_database(workbench_root: &Path) -> ProjectResult<Connection> {
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
            ",
        )
        .map_err(error_message)?;
    ensure_column(
        &connection,
        "projects",
        "archived",
        "ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    )?;
    migrate_legacy_launch_configs(&connection)?;
    Ok(connection)
}

fn load_projects(connection: &Connection) -> ProjectResult<Vec<ProjectRecord>> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, path, note, tags_json, archived
            FROM projects
            ORDER BY lower(name)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(4)?;
            let id: String = row.get(0)?;
            Ok(ProjectRecord {
                launch_configs: load_launch_configs(connection, &id).unwrap_or_default(),
                id,
                name: row.get(1)?,
                path: row.get(2)?,
                note: row.get(3)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                archived: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(error_message)?;

    let mut projects = Vec::new();
    for row in rows {
        projects.push(row.map_err(error_message)?);
    }
    Ok(projects)
}

fn upsert_project(connection: &Connection, project: &ProjectRecord) -> ProjectResult<()> {
    let tags_json = serde_json::to_string(&project.tags).map_err(error_message)?;
    let transaction = connection.unchecked_transaction().map_err(error_message)?;
    transaction
        .execute(
            "
            INSERT INTO projects(id, name, path, note, tags_json, archived)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6)
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

fn validate_project(project: &ProjectRecord) -> ProjectResult<()> {
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

fn validate_launch_request(command: &str, workdir: &str) -> ProjectResult<()> {
    if command.trim().is_empty() {
        return Err("启动命令不能为空".to_string());
    }
    if workdir.trim().is_empty() {
        return Err("启动工作目录不能为空".to_string());
    }
    let path = Path::new(workdir);
    if !path.exists() {
        return Err(format!("启动工作目录不存在: {workdir}"));
    }
    if !path.is_dir() {
        return Err(format!("启动工作目录不是文件夹: {workdir}"));
    }
    Ok(())
}

fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
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

fn enabled_launch_configs(configs: &[ProjectLaunchConfig]) -> Vec<ProjectLaunchConfig> {
    configs
        .iter()
        .filter(|config| config.enabled && !config.command.trim().is_empty())
        .cloned()
        .collect()
}

fn migrate_legacy_launch_configs(connection: &Connection) -> ProjectResult<()> {
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

#[cfg(windows)]
fn launch_in_terminal(name: &str, command: &str, workdir: &str) -> ProjectResult<()> {
    let title = format!("Workbench - {}", sanitize_title(name));
    Command::new("cmd")
        .args(["/C", "start", &title, "/D", workdir, "cmd", "/K", command])
        .spawn()
        .map_err(|error| format!("启动项目失败: {error}"))?;
    Ok(())
}

#[cfg(not(windows))]
fn launch_in_terminal(_name: &str, _command: &str, _workdir: &str) -> ProjectResult<()> {
    Err("当前系统暂不支持项目启动".to_string())
}

#[cfg(windows)]
fn sanitize_title(name: &str) -> String {
    let title = name.trim();
    if title.is_empty() {
        "Project".to_string()
    } else {
        title.replace('"', "'")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_empty_launch_command() {
        let dir = tempdir().unwrap();
        let result = validate_launch_request("", dir.path().to_str().unwrap());
        assert!(result.unwrap_err().contains("启动命令不能为空"));
    }

    #[test]
    fn rejects_missing_workdir() {
        let result = validate_launch_request("pnpm dev", "Z:\\definitely-missing-workbench-dir");
        assert!(result.unwrap_err().contains("启动工作目录不存在"));
    }

    #[test]
    fn accepts_existing_workdir_and_command() {
        let dir = tempdir().unwrap();
        let result = validate_launch_request("pnpm dev", dir.path().to_str().unwrap());
        assert!(result.is_ok());
    }

    #[test]
    fn selects_all_enabled_launch_configs_with_commands() {
        let configs = vec![
            ProjectLaunchConfig {
                id: "frontend".to_string(),
                name: "Frontend".to_string(),
                command: "pnpm dev".to_string(),
                workdir: "E:\\Demo".to_string(),
                enabled: true,
            },
            ProjectLaunchConfig {
                id: "backend".to_string(),
                name: "Backend".to_string(),
                command: "uv run app.py".to_string(),
                workdir: "E:\\Demo".to_string(),
                enabled: true,
            },
            ProjectLaunchConfig {
                id: "disabled".to_string(),
                name: "Disabled".to_string(),
                command: "ignored".to_string(),
                workdir: "E:\\Demo".to_string(),
                enabled: false,
            },
            ProjectLaunchConfig {
                id: "empty".to_string(),
                name: "Empty".to_string(),
                command: String::new(),
                workdir: "E:\\Demo".to_string(),
                enabled: true,
            },
        ];

        let selected = enabled_launch_configs(&configs);

        assert_eq!(
            selected
                .iter()
                .map(|config| config.id.as_str())
                .collect::<Vec<_>>(),
            vec!["frontend", "backend"]
        );
    }

    #[test]
    fn persists_and_loads_project() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let project = ProjectRecord {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            path: "E:\\Demo".to_string(),
            note: "note".to_string(),
            tags: vec!["Tauri".to_string(), "本地工具".to_string()],
            archived: false,
            launch_configs: vec![ProjectLaunchConfig {
                id: "demo-dev".to_string(),
                name: "Dev".to_string(),
                command: "pnpm dev".to_string(),
                workdir: "E:\\Demo".to_string(),
                enabled: true,
            }],
        };

        upsert_project(&connection, &project).unwrap();
        let projects = load_projects(&connection).unwrap();

        assert_eq!(projects, vec![project]);
    }

    #[test]
    fn updates_existing_project_by_id() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let mut project = ProjectRecord {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            path: "E:\\Demo".to_string(),
            note: String::new(),
            tags: Vec::new(),
            archived: false,
            launch_configs: Vec::new(),
        };

        upsert_project(&connection, &project).unwrap();
        project.name = "Demo Updated".to_string();
        project.launch_configs.push(ProjectLaunchConfig {
            id: "demo-dev".to_string(),
            name: "Dev".to_string(),
            command: "pnpm dev".to_string(),
            workdir: "E:\\Demo".to_string(),
            enabled: true,
        });
        upsert_project(&connection, &project).unwrap();

        let projects = load_projects(&connection).unwrap();
        assert_eq!(projects, vec![project]);
    }

    #[test]
    fn migrates_legacy_launch_command_to_default_config() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        connection
            .execute(
                "
                INSERT INTO projects(id, name, path, note, tags_json, launch_command, launch_workdir, status)
                VALUES('legacy', 'Legacy', 'E:\\Legacy', '', '[]', 'pnpm dev', 'E:\\Legacy', 'configured')
                ",
                [],
            )
            .unwrap();

        migrate_legacy_launch_configs(&connection).unwrap();
        let projects = load_projects(&connection).unwrap();

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].launch_configs.len(), 1);
        assert_eq!(projects[0].launch_configs[0].command, "pnpm dev");
        assert_eq!(projects[0].launch_configs[0].workdir, "E:\\Legacy");
        assert!(projects[0].launch_configs[0].enabled);
        assert!(!projects[0].archived);
    }

    #[test]
    fn persists_project_archive_state() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let project = ProjectRecord {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            path: "E:\\Demo".to_string(),
            note: String::new(),
            tags: Vec::new(),
            launch_configs: Vec::new(),
            archived: true,
        };

        upsert_project(&connection, &project).unwrap();
        let projects = load_projects(&connection).unwrap();

        assert_eq!(projects, vec![project]);
    }

    #[test]
    fn migrates_project_archive_state_default_to_false() {
        let dir = tempdir().unwrap();
        let database_path = dir.path().join("workbench.sqlite");
        let connection = Connection::open(&database_path).unwrap();
        connection
            .execute_batch(
                "
                CREATE TABLE projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    note TEXT NOT NULL DEFAULT '',
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    launch_command TEXT NOT NULL DEFAULT '',
                    launch_workdir TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'missing-command',
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
                );
                INSERT INTO projects(id, name, path, note, tags_json, launch_command, launch_workdir, status)
                VALUES('legacy', 'Legacy', 'E:\\Legacy', '', '[]', '', '', 'missing-command');
                ",
            )
            .unwrap();
        drop(connection);

        let connection = open_database(dir.path()).unwrap();
        let projects = load_projects(&connection).unwrap();

        assert_eq!(projects.len(), 1);
        assert!(!projects[0].archived);
    }
}
