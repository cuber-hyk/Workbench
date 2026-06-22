mod db;
mod launch;
mod profiles;
mod types;

use std::path::PathBuf;

use tauri_plugin_dialog::DialogExt;

pub use launch::LaunchSessionRegistry;
pub use types::{
    LaunchRun, LaunchSession, LaunchSessionSnapshot, ProjectLaunchConfig, ProjectOpenProfile,
    ProjectRecord,
};

pub(crate) type ProjectResult<T> = Result<T, String>;

#[tauri::command]
pub fn list_projects() -> ProjectResult<Vec<ProjectRecord>> {
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::load_projects(&connection)
}

#[tauri::command]
pub fn save_project(project: ProjectRecord) -> ProjectResult<Vec<ProjectRecord>> {
    db::validate_project(&project)?;
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::upsert_project(&connection, &project)?;
    db::load_projects(&connection)
}

#[tauri::command]
pub fn launch_project<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: tauri::State<LaunchSessionRegistry>,
    project_id: String,
    name: String,
    launch_configs: Vec<ProjectLaunchConfig>,
) -> ProjectResult<LaunchRun> {
    let enabled_configs = launch::enabled_launch_configs(&launch_configs);
    if enabled_configs.is_empty() {
        return Err("没有可启动的启用项".to_string());
    }
    for config in &enabled_configs {
        launch::validate_launch_request(&config.command, &config.workdir)?;
    }
    let launch_run = launch::create_launch_run(&project_id, &name, &enabled_configs);
    let mut started_session_ids: Vec<String> = Vec::new();
    for session in &launch_run.sessions {
        if let Err(error) =
            launch::start_launch_session(app.clone(), registry.inner().clone(), session)
        {
            for session_id in started_session_ids {
                let _ = launch::stop_registered_session(registry.inner(), &session_id);
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
    let launch_run_id = launch::stop_registered_session(registry.inner(), &session_id)?;
    launch::emit_stopped_status(&app, &launch_run_id, &session_id);
    Ok(())
}

#[tauri::command]
pub fn restart_launch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: tauri::State<LaunchSessionRegistry>,
    session: LaunchSession,
) -> ProjectResult<LaunchSession> {
    launch::validate_launch_request(&session.command, &session.workdir)?;
    let next_session = LaunchSession {
        status: types::LaunchSessionStatus::Running,
        exit_code: None,
        output: Vec::new(),
        ..session
    };
    launch::start_launch_session(app, registry.inner().clone(), &next_session)?;
    Ok(next_session)
}

#[tauri::command]
pub fn stop_launch_run<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    registry: tauri::State<LaunchSessionRegistry>,
    launch_run_id: String,
) -> ProjectResult<()> {
    let session_ids = registry.session_ids_for_run(&launch_run_id)?;
    if session_ids.is_empty() {
        return Err("没有可停止的启动会话".to_string());
    }
    for session_id in session_ids {
        let stopped_launch_run_id = launch::stop_registered_session(registry.inner(), &session_id)?;
        launch::emit_stopped_status(&app, &stopped_launch_run_id, &session_id);
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

#[tauri::command]
pub fn list_project_open_profiles() -> ProjectResult<Vec<ProjectOpenProfile>> {
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::load_project_open_profiles(&connection)
}

#[tauri::command]
pub fn save_project_open_profile(
    profile: ProjectOpenProfile,
) -> ProjectResult<Vec<ProjectOpenProfile>> {
    profiles::validate_project_open_profile(&profile)?;
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::upsert_project_open_profile(&connection, &profile)?;
    db::load_project_open_profiles(&connection)
}

#[tauri::command]
pub fn delete_project_open_profile(id: String) -> ProjectResult<Vec<ProjectOpenProfile>> {
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::delete_project_open_profile(&connection, &id)?;
    db::load_project_open_profiles(&connection)
}

#[tauri::command]
pub async fn select_project_open_executable<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> ProjectResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_file()
        .map(|path| path.to_string()))
}

#[tauri::command]
pub fn open_project_with_profile(
    project_path: String,
    profile: ProjectOpenProfile,
) -> ProjectResult<()> {
    profiles::open_project_with_profile_impl(&project_path, &profile)
}

fn default_workbench_root() -> ProjectResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".workbench"))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}

pub(crate) fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::db::{
        load_project_open_profiles, load_projects, migrate_legacy_launch_configs, open_database,
        seed_default_project_open_profiles, upsert_project, upsert_project_open_profile,
    };
    use super::launch::{
        create_launch_run, enabled_launch_configs, stop_registered_session,
        validate_launch_request, RunningLaunchSession,
    };
    use super::profiles::{expanded_args, terminal_command_line, validate_project_open_profile};
    use super::types::{
        LaunchOutputChunk, LaunchOutputStream, LaunchSessionStatus, ProjectOpenProfileKind,
    };
    use super::*;
    use rusqlite::{params, Connection};
    use std::sync::{Arc, Mutex};
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
    fn seeds_default_project_open_profiles_once() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let profiles = load_project_open_profiles(&connection).unwrap();

        assert_eq!(profiles.len(), 4);
        assert_eq!(profiles[0].name, "VS Code");

        delete_project_open_profile_from_connection(&connection, "vscode");
        seed_default_project_open_profiles(&connection).unwrap();
        let profiles = load_project_open_profiles(&connection).unwrap();

        assert_eq!(profiles.len(), 3);
        assert!(!profiles.iter().any(|profile| profile.id == "vscode"));
    }

    #[test]
    fn persists_project_open_profile() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let profile = ProjectOpenProfile {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
            kind: ProjectOpenProfileKind::App,
            command: "cursor".to_string(),
            executable_path: String::new(),
            args: vec!["{projectPath}".to_string()],
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 9,
        };

        upsert_project_open_profile(&connection, &profile).unwrap();
        let profiles = load_project_open_profiles(&connection).unwrap();

        assert!(profiles.iter().any(|item| item == &profile));
    }

    #[test]
    fn expands_project_open_profile_arguments() {
        let dir = tempdir().unwrap();
        let args = expanded_args(
            dir.path(),
            &["--reuse-window".to_string(), "{projectPath}".to_string()],
        );

        assert_eq!(args[0], "--reuse-window");
        assert_eq!(args[1], dir.path().to_string_lossy().to_string());
    }

    #[test]
    fn terminal_command_line_splits_inline_command_arguments() {
        let dir = tempdir().unwrap();
        let profile = ProjectOpenProfile {
            id: "deveco".to_string(),
            name: "DevEco".to_string(),
            kind: ProjectOpenProfileKind::Terminal,
            command: "deveco -c --skip-agreement".to_string(),
            executable_path: String::new(),
            args: vec!["{projectPath}".to_string()],
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 0,
        };

        assert_eq!(
            terminal_command_line(dir.path(), &profile),
            format!(
                "& 'deveco' '-c' '--skip-agreement' '{}'",
                dir.path().to_string_lossy()
            )
        );
    }

    #[test]
    fn terminal_command_line_keeps_executable_path_as_program() {
        let dir = tempdir().unwrap();
        let profile = ProjectOpenProfile {
            id: "custom".to_string(),
            name: "Custom".to_string(),
            kind: ProjectOpenProfileKind::Terminal,
            command: "ignored --flag".to_string(),
            executable_path: "C:\\Program Files\\DevEco\\deveco.exe".to_string(),
            args: vec!["--skip-agreement".to_string(), "{projectPath}".to_string()],
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 0,
        };

        assert_eq!(
            terminal_command_line(dir.path(), &profile),
            format!(
                "& 'C:\\Program Files\\DevEco\\deveco.exe' '--skip-agreement' '{}'",
                dir.path().to_string_lossy()
            )
        );
    }

    #[test]
    fn rejects_project_open_profile_without_command_or_executable() {
        let profile = ProjectOpenProfile {
            id: "broken".to_string(),
            name: "Broken".to_string(),
            kind: ProjectOpenProfileKind::App,
            command: String::new(),
            executable_path: String::new(),
            args: Vec::new(),
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 0,
        };

        let result = validate_project_open_profile(&profile);

        assert!(result
            .unwrap_err()
            .contains("打开方式未配置命令或可执行文件路径"));
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

    fn delete_project_open_profile_from_connection(connection: &Connection, id: &str) {
        connection
            .execute(
                "DELETE FROM project_open_profiles WHERE id = ?1",
                params![id],
            )
            .unwrap();
    }
}
