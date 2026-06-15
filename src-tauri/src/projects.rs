use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

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

type SharedChild = Arc<Mutex<Option<Child>>>;

#[derive(Clone, Default)]
pub struct LaunchSessionRegistry {
    sessions: Arc<Mutex<HashMap<String, RunningLaunchSession>>>,
    snapshots: Arc<Mutex<HashMap<String, LaunchSessionSnapshot>>>,
}

#[derive(Clone)]
struct RunningLaunchSession {
    launch_run_id: String,
    child: SharedChild,
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
pub fn launch_project<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: tauri::State<LaunchSessionRegistry>,
    project_id: String,
    name: String,
    launch_configs: Vec<ProjectLaunchConfig>,
) -> ProjectResult<LaunchRun> {
    let enabled_configs = enabled_launch_configs(&launch_configs);
    if enabled_configs.is_empty() {
        return Err("没有可启动的启用项".to_string());
    }
    for config in &enabled_configs {
        validate_launch_request(&config.command, &config.workdir)?;
    }
    let launch_run = create_launch_run(&project_id, &name, &enabled_configs);
    let mut started_session_ids: Vec<String> = Vec::new();
    for session in &launch_run.sessions {
        if let Err(error) = start_launch_session(app.clone(), registry.inner().clone(), session) {
            for session_id in started_session_ids {
                let _ = stop_registered_session(registry.inner(), &session_id);
            }
            return Err(error);
        }
        started_session_ids.push(session.id.clone());
    }
    Ok(launch_run)
}

#[tauri::command]
pub fn stop_launch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: tauri::State<LaunchSessionRegistry>,
    session_id: String,
) -> ProjectResult<()> {
    let launch_run_id = stop_registered_session(registry.inner(), &session_id)?;
    emit_stopped_status(&app, &launch_run_id, &session_id);
    Ok(())
}

#[tauri::command]
pub fn restart_launch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: tauri::State<LaunchSessionRegistry>,
    session: LaunchSession,
) -> ProjectResult<LaunchSession> {
    validate_launch_request(&session.command, &session.workdir)?;
    let next_session = LaunchSession {
        status: LaunchSessionStatus::Running,
        exit_code: None,
        output: Vec::new(),
        ..session
    };
    start_launch_session(app, registry.inner().clone(), &next_session)?;
    Ok(next_session)
}

#[tauri::command]
pub fn stop_launch_run<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: tauri::State<LaunchSessionRegistry>,
    launch_run_id: String,
) -> ProjectResult<()> {
    let session_ids = {
        let sessions = registry.sessions.lock().map_err(error_message)?;
        sessions
            .iter()
            .filter_map(|(session_id, session)| {
                if session.launch_run_id == launch_run_id {
                    Some(session_id.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
    };
    if session_ids.is_empty() {
        return Err("没有可停止的启动会话".to_string());
    }
    for session_id in session_ids {
        let stopped_launch_run_id = stop_registered_session(registry.inner(), &session_id)?;
        emit_stopped_status(&app, &stopped_launch_run_id, &session_id);
    }
    Ok(())
}

#[tauri::command]
pub fn get_launch_run_snapshot(
    registry: tauri::State<LaunchSessionRegistry>,
    launch_run_id: String,
) -> ProjectResult<Vec<LaunchSessionSnapshot>> {
    registry.snapshots_for_run(&launch_run_id)
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

fn create_launch_run(
    project_id: &str,
    project_name: &str,
    configs: &[ProjectLaunchConfig],
) -> LaunchRun {
    let id = format!("launch-{}", unix_millis());
    LaunchRun {
        id: id.clone(),
        project_id: project_id.to_string(),
        project_name: project_name.to_string(),
        started_at: format_launch_time(),
        sessions: configs
            .iter()
            .enumerate()
            .map(|(index, config)| LaunchSession {
                id: format!("{id}-{}-{index}", sanitize_id(&config.id)),
                launch_run_id: id.clone(),
                config_id: config.id.clone(),
                config_name: config.name.clone(),
                command: config.command.clone(),
                workdir: config.workdir.clone(),
                status: LaunchSessionStatus::Running,
                exit_code: None,
                output: Vec::new(),
            })
            .collect(),
    }
}

fn start_launch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: LaunchSessionRegistry,
    session: &LaunchSession,
) -> ProjectResult<()> {
    let mut command = shell_command(&session.command, &session.workdir);
    command
        .env("PYTHONUNBUFFERED", "1")
        .env("NO_COLOR", "1")
        .env("UV_NO_PROGRESS", "1");
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动项目失败: {error}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let shared_child = Arc::new(Mutex::new(Some(child)));
    if let Err(error) = registry.insert(
        session.id.clone(),
        RunningLaunchSession {
            launch_run_id: session.launch_run_id.clone(),
            child: shared_child.clone(),
        },
    ) {
        let mut child_guard = shared_child.lock().map_err(error_message)?;
        if let Some(child) = child_guard.as_mut() {
            let _ = terminate_child(child);
        }
        *child_guard = None;
        return Err(error);
    }
    registry.upsert_snapshot(session)?;

    emit_launch_status(&app, session, LaunchSessionStatus::Running, None);

    if let Some(stdout) = stdout {
        spawn_output_reader(
            app.clone(),
            registry.clone(),
            session.launch_run_id.clone(),
            session.id.clone(),
            LaunchOutputStream::Stdout,
            stdout,
        );
    }
    if let Some(stderr) = stderr {
        spawn_output_reader(
            app.clone(),
            registry.clone(),
            session.launch_run_id.clone(),
            session.id.clone(),
            LaunchOutputStream::Stderr,
            stderr,
        );
    }
    spawn_exit_watcher(
        app,
        registry,
        session.launch_run_id.clone(),
        session.id.clone(),
        shared_child,
    );
    Ok(())
}

fn spawn_output_reader<R: tauri::Runtime, T: Read + Send + 'static>(
    app: tauri::AppHandle<R>,
    registry: LaunchSessionRegistry,
    launch_run_id: String,
    session_id: String,
    stream: LaunchOutputStream,
    reader: T,
) {
    thread::spawn(move || {
        let mut reader = reader;
        let mut buffer = [0_u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(byte_count) => {
                    let content = String::from_utf8_lossy(&buffer[..byte_count]).to_string();
                    let _ = registry.append_output(
                        &session_id,
                        LaunchOutputChunk {
                            stream: stream.clone(),
                            content: content.clone(),
                        },
                    );
                    let _ = app.emit(
                        "launch-session-event",
                        LaunchSessionEvent {
                            launch_run_id: launch_run_id.clone(),
                            session_id: session_id.clone(),
                            event_type: LaunchSessionEventType::Output,
                            stream: Some(stream.clone()),
                            content: Some(content),
                            status: None,
                            exit_code: None,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_exit_watcher<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: LaunchSessionRegistry,
    launch_run_id: String,
    session_id: String,
    child: SharedChild,
) {
    thread::spawn(move || loop {
        let status = {
            let mut child_guard = match child.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let Some(child) = child_guard.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(Some(status)) => Some(status),
                Ok(None) => None,
                Err(_) => {
                    let _ = registry.update_status(&session_id, LaunchSessionStatus::Failed, None);
                    let _ = app.emit(
                        "launch-session-event",
                        LaunchSessionEvent {
                            launch_run_id: launch_run_id.clone(),
                            session_id: session_id.clone(),
                            event_type: LaunchSessionEventType::Status,
                            stream: None,
                            content: None,
                            status: Some(LaunchSessionStatus::Failed),
                            exit_code: None,
                        },
                    );
                    let _ = registry.remove(&session_id);
                    return;
                }
            }
        };
        if let Some(status) = status {
            let exit_code = status.code();
            let next_status = if status.success() {
                LaunchSessionStatus::Exited
            } else {
                LaunchSessionStatus::Failed
            };
            let _ = registry.update_status(&session_id, next_status.clone(), exit_code);
            let _ = app.emit(
                "launch-session-event",
                LaunchSessionEvent {
                    launch_run_id: launch_run_id.clone(),
                    session_id: session_id.clone(),
                    event_type: LaunchSessionEventType::Status,
                    stream: None,
                    content: None,
                    status: Some(next_status),
                    exit_code,
                },
            );
            let _ = registry.remove(&session_id);
            return;
        }
        thread::sleep(Duration::from_millis(120));
    });
}

fn stop_registered_session(
    registry: &LaunchSessionRegistry,
    session_id: &str,
) -> ProjectResult<String> {
    let session = registry
        .remove(session_id)?
        .ok_or_else(|| format!("启动会话不存在或已结束: {session_id}"))?;
    let launch_run_id = session.launch_run_id.clone();
    let mut child_guard = session.child.lock().map_err(error_message)?;
    if let Some(child) = child_guard.as_mut() {
        terminate_child(child)?;
    }
    *child_guard = None;
    registry.update_status(session_id, LaunchSessionStatus::Stopped, None)?;
    Ok(launch_run_id)
}

impl LaunchSessionRegistry {
    fn insert(&self, session_id: String, session: RunningLaunchSession) -> ProjectResult<()> {
        let mut sessions = self.sessions.lock().map_err(error_message)?;
        if sessions.contains_key(&session_id) {
            return Err(format!("启动会话仍在运行: {session_id}"));
        }
        sessions.insert(session_id, session);
        Ok(())
    }

    fn remove(&self, session_id: &str) -> ProjectResult<Option<RunningLaunchSession>> {
        Ok(self
            .sessions
            .lock()
            .map_err(error_message)?
            .remove(session_id))
    }

    fn upsert_snapshot(&self, session: &LaunchSession) -> ProjectResult<()> {
        self.snapshots.lock().map_err(error_message)?.insert(
            session.id.clone(),
            LaunchSessionSnapshot {
                launch_run_id: session.launch_run_id.clone(),
                session_id: session.id.clone(),
                status: session.status.clone(),
                exit_code: session.exit_code,
                output: session.output.clone(),
            },
        );
        Ok(())
    }

    fn append_output(&self, session_id: &str, chunk: LaunchOutputChunk) -> ProjectResult<()> {
        if let Some(snapshot) = self
            .snapshots
            .lock()
            .map_err(error_message)?
            .get_mut(session_id)
        {
            snapshot.output.push(chunk);
        }
        Ok(())
    }

    fn update_status(
        &self,
        session_id: &str,
        status: LaunchSessionStatus,
        exit_code: Option<i32>,
    ) -> ProjectResult<()> {
        if let Some(snapshot) = self
            .snapshots
            .lock()
            .map_err(error_message)?
            .get_mut(session_id)
        {
            snapshot.status = status;
            snapshot.exit_code = exit_code.or(snapshot.exit_code);
        }
        Ok(())
    }

    fn snapshots_for_run(&self, launch_run_id: &str) -> ProjectResult<Vec<LaunchSessionSnapshot>> {
        Ok(self
            .snapshots
            .lock()
            .map_err(error_message)?
            .values()
            .filter(|snapshot| snapshot.launch_run_id == launch_run_id)
            .cloned()
            .collect())
    }
}

fn emit_launch_status<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    session: &LaunchSession,
    status: LaunchSessionStatus,
    exit_code: Option<i32>,
) {
    let _ = app.emit(
        "launch-session-event",
        LaunchSessionEvent {
            launch_run_id: session.launch_run_id.clone(),
            session_id: session.id.clone(),
            event_type: LaunchSessionEventType::Status,
            stream: None,
            content: None,
            status: Some(status),
            exit_code,
        },
    );
}

fn emit_stopped_status<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    launch_run_id: &str,
    session_id: &str,
) {
    let _ = app.emit(
        "launch-session-event",
        LaunchSessionEvent {
            launch_run_id: launch_run_id.to_string(),
            session_id: session_id.to_string(),
            event_type: LaunchSessionEventType::Status,
            stream: None,
            content: None,
            status: Some(LaunchSessionStatus::Stopped),
            exit_code: None,
        },
    );
}

#[cfg(windows)]
fn shell_command(command: &str, workdir: &str) -> Command {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut shell = Command::new("cmd");
    shell
        .args(["/C", command])
        .current_dir(workdir)
        .creation_flags(CREATE_NO_WINDOW);
    shell
}

#[cfg(not(windows))]
fn shell_command(command: &str, workdir: &str) -> Command {
    let mut shell = Command::new("sh");
    shell.args(["-c", command]).current_dir(workdir);
    shell
}

#[cfg(windows)]
fn terminate_child(child: &mut Child) -> ProjectResult<()> {
    let pid = child.id().to_string();
    let _ = Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = child.kill();
    Ok(())
}

#[cfg(not(windows))]
fn terminate_child(child: &mut Child) -> ProjectResult<()> {
    child.kill().map_err(error_message)
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn format_launch_time() -> String {
    "刚刚".to_string()
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect()
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
    fn creates_separate_launch_sessions_for_enabled_configs() {
        let configs = vec![
            ProjectLaunchConfig {
                id: "frontend".to_string(),
                name: "Frontend".to_string(),
                command: "pnpm dev".to_string(),
                workdir: "E:\\Demo".to_string(),
                enabled: true,
            },
            ProjectLaunchConfig {
                id: "worker".to_string(),
                name: "Worker".to_string(),
                command: "pnpm worker".to_string(),
                workdir: "E:\\Demo".to_string(),
                enabled: true,
            },
        ];

        let launch_run = create_launch_run("demo", "Demo", &configs);

        assert_eq!(launch_run.project_id, "demo");
        assert_eq!(launch_run.sessions.len(), 2);
        assert_eq!(launch_run.sessions[0].config_name, "Frontend");
        assert_eq!(launch_run.sessions[1].config_name, "Worker");
        assert_ne!(launch_run.sessions[0].id, launch_run.sessions[1].id);
        assert_eq!(launch_run.sessions[0].status, LaunchSessionStatus::Running);
        assert!(launch_run.sessions[0].output.is_empty());
    }

    #[test]
    fn stopping_unknown_launch_session_fails_loudly() {
        let registry = LaunchSessionRegistry::default();
        let result = stop_registered_session(&registry, "missing-session");

        assert!(result.unwrap_err().contains("启动会话不存在或已结束"));
    }

    #[test]
    fn inserting_existing_launch_session_fails_loudly() {
        let registry = LaunchSessionRegistry::default();
        let child = Arc::new(Mutex::new(None));
        registry
            .insert(
                "session-1".to_string(),
                RunningLaunchSession {
                    launch_run_id: "run-1".to_string(),
                    child: child.clone(),
                },
            )
            .unwrap();

        let result = registry.insert(
            "session-1".to_string(),
            RunningLaunchSession {
                launch_run_id: "run-1".to_string(),
                child,
            },
        );

        assert!(result.unwrap_err().contains("启动会话仍在运行"));
    }

    #[test]
    fn keeps_launch_output_in_memory_snapshot() {
        let registry = LaunchSessionRegistry::default();
        let session = LaunchSession {
            id: "session-1".to_string(),
            launch_run_id: "run-1".to_string(),
            config_id: "dev".to_string(),
            config_name: "Dev".to_string(),
            command: "pnpm dev".to_string(),
            workdir: "E:\\Demo".to_string(),
            status: LaunchSessionStatus::Running,
            exit_code: None,
            output: Vec::new(),
        };

        registry.upsert_snapshot(&session).unwrap();
        registry
            .append_output(
                "session-1",
                LaunchOutputChunk {
                    stream: LaunchOutputStream::Stderr,
                    content: "Uvicorn running on http://127.0.0.1:8001\n".to_string(),
                },
            )
            .unwrap();

        let snapshots = registry.snapshots_for_run("run-1").unwrap();

        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].output.len(), 1);
        assert_eq!(
            snapshots[0].output[0].content,
            "Uvicorn running on http://127.0.0.1:8001\n"
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
