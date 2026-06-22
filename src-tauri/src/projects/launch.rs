use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::Emitter;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use super::error_message;
use super::types::{
    LaunchOutputChunk, LaunchOutputStream, LaunchRun, LaunchSession, LaunchSessionEvent,
    LaunchSessionEventType, LaunchSessionSnapshot, LaunchSessionStatus, ProjectLaunchConfig,
};
use super::ProjectResult;

type SharedChild = Arc<Mutex<Option<Child>>>;

#[derive(Clone, Default)]
pub struct LaunchSessionRegistry {
    sessions: Arc<Mutex<HashMap<String, RunningLaunchSession>>>,
    snapshots: Arc<Mutex<HashMap<String, LaunchSessionSnapshot>>>,
}

#[derive(Clone)]
pub(super) struct RunningLaunchSession {
    pub(super) launch_run_id: String,
    pub(super) child: SharedChild,
}

pub(crate) fn validate_launch_request(command: &str, workdir: &str) -> ProjectResult<()> {
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

pub(crate) fn enabled_launch_configs(configs: &[ProjectLaunchConfig]) -> Vec<ProjectLaunchConfig> {
    configs
        .iter()
        .filter(|config| config.enabled && !config.command.trim().is_empty())
        .cloned()
        .collect()
}

pub(crate) fn create_launch_run(
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

pub(crate) fn start_launch_session<R: tauri::Runtime>(
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

pub(crate) fn stop_registered_session(
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
    pub(super) fn insert(
        &self,
        session_id: String,
        session: RunningLaunchSession,
    ) -> ProjectResult<()> {
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

    pub(crate) fn upsert_snapshot(&self, session: &LaunchSession) -> ProjectResult<()> {
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

    pub(crate) fn append_output(
        &self,
        session_id: &str,
        chunk: LaunchOutputChunk,
    ) -> ProjectResult<()> {
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

    pub(crate) fn session_ids_for_run(&self, launch_run_id: &str) -> ProjectResult<Vec<String>> {
        Ok(self
            .sessions
            .lock()
            .map_err(error_message)?
            .iter()
            .filter_map(|(session_id, session)| {
                if session.launch_run_id == launch_run_id {
                    Some(session_id.clone())
                } else {
                    None
                }
            })
            .collect())
    }

    pub(crate) fn snapshots_for_run(
        &self,
        launch_run_id: &str,
    ) -> ProjectResult<Vec<LaunchSessionSnapshot>> {
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

pub(crate) fn emit_stopped_status<R: tauri::Runtime>(
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
