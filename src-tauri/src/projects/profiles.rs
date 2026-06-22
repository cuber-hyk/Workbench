use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use super::types::{ProjectOpenProfile, ProjectOpenProfileKind};
use super::ProjectResult;

pub(crate) fn validate_project_open_profile(profile: &ProjectOpenProfile) -> ProjectResult<()> {
    if profile.id.trim().is_empty() {
        return Err("打开方式 ID 不能为空".to_string());
    }
    if profile.name.trim().is_empty() {
        return Err("打开方式名称不能为空".to_string());
    }
    if profile.command.trim().is_empty() && profile.executable_path.trim().is_empty() {
        return Err("打开方式未配置命令或可执行文件路径。".to_string());
    }
    if !profile.executable_path.trim().is_empty() {
        let path = Path::new(&profile.executable_path);
        if !path.exists() {
            return Err("可执行文件不存在，请重新选择程序。".to_string());
        }
        if !path.is_file() {
            return Err("可执行文件路径不是文件，请重新选择程序。".to_string());
        }
    }
    Ok(())
}

pub(crate) fn open_project_with_profile_impl(
    project_path: &str,
    profile: &ProjectOpenProfile,
) -> ProjectResult<()> {
    if project_path.trim().is_empty() {
        return Err("项目路径不能为空，无法用外部工具打开。".to_string());
    }
    let project_path = Path::new(project_path);
    if !project_path.exists() {
        return Err("项目路径不存在，请先检查项目记录。".to_string());
    }
    if !project_path.is_dir() {
        return Err("项目路径不是文件夹，无法用外部工具打开。".to_string());
    }
    if !profile.enabled {
        return Err("该打开方式已停用。".to_string());
    }
    validate_project_open_profile_for_run(profile)?;
    match profile.kind {
        ProjectOpenProfileKind::App => open_project_with_app(project_path, profile),
        ProjectOpenProfileKind::Terminal => open_project_with_terminal(project_path, profile),
    }
}

fn validate_project_open_profile_for_run(profile: &ProjectOpenProfile) -> ProjectResult<()> {
    if profile.command.trim().is_empty() && profile.executable_path.trim().is_empty() {
        return Err("打开方式未配置命令或可执行文件路径。".to_string());
    }
    if !profile.executable_path.trim().is_empty() {
        let path = Path::new(&profile.executable_path);
        if !path.exists() {
            return Err("可执行文件不存在，请重新选择程序。".to_string());
        }
        if !path.is_file() {
            return Err("可执行文件路径不是文件，请重新选择程序。".to_string());
        }
    }
    Ok(())
}

fn open_project_with_app(project_path: &Path, profile: &ProjectOpenProfile) -> ProjectResult<()> {
    let program = profile_program(profile);
    let workdir = expanded_workdir(project_path, profile)?;
    let args = expanded_args(project_path, &profile.args);
    let mut command = Command::new(&program);
    command.args(args).current_dir(workdir);
    spawn_silent_external_command(command, &profile.name)
}

#[cfg(windows)]
fn open_project_with_terminal(
    project_path: &Path,
    profile: &ProjectOpenProfile,
) -> ProjectResult<()> {
    let workdir = expanded_workdir(project_path, profile)?;
    let command_line = terminal_command_line(project_path, profile);
    let workdir_text = workdir.to_string_lossy().to_string();

    let mut windows_terminal = Command::new("wt");
    windows_terminal
        .args([
            "-d",
            &workdir_text,
            "powershell",
            "-NoExit",
            "-Command",
            &command_line,
        ])
        .current_dir(&workdir);
    match windows_terminal.spawn() {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            let mut powershell = Command::new("powershell");
            powershell
                .args(["-NoExit", "-Command", &command_line])
                .current_dir(workdir);
            spawn_external_command(powershell, &profile.name)
        }
        Err(error) => Err(open_profile_spawn_error(&profile.name, error)),
    }
}

#[cfg(not(windows))]
fn open_project_with_terminal(
    _project_path: &Path,
    _profile: &ProjectOpenProfile,
) -> ProjectResult<()> {
    Err("当前系统暂不支持该打开方式。".to_string())
}

fn profile_program(profile: &ProjectOpenProfile) -> String {
    if profile.executable_path.trim().is_empty() {
        profile.command.trim().to_string()
    } else {
        profile.executable_path.trim().to_string()
    }
}

pub(crate) fn expanded_args(project_path: &Path, args: &[String]) -> Vec<String> {
    let project_path = project_path.to_string_lossy();
    args.iter()
        .map(|arg| arg.replace("{projectPath}", &project_path))
        .collect()
}

fn expanded_workdir(project_path: &Path, profile: &ProjectOpenProfile) -> ProjectResult<PathBuf> {
    let raw_workdir = if profile.workdir.trim().is_empty() {
        "{projectPath}"
    } else {
        profile.workdir.trim()
    };
    let workdir = raw_workdir.replace("{projectPath}", &project_path.to_string_lossy());
    let path = PathBuf::from(workdir);
    if !path.exists() {
        return Err("项目路径不存在，请先检查项目记录。".to_string());
    }
    if !path.is_dir() {
        return Err("项目路径不是文件夹，无法用外部工具打开。".to_string());
    }
    Ok(path)
}

pub(crate) fn terminal_command_line(project_path: &Path, profile: &ProjectOpenProfile) -> String {
    let mut parts = terminal_command_parts(profile);
    parts.extend(
        expanded_args(project_path, &profile.args)
            .iter()
            .map(|arg| quote_powershell_arg(arg)),
    );
    format!("& {}", parts.join(" "))
}

pub(crate) fn default_project_open_profiles() -> Vec<ProjectOpenProfile> {
    vec![
        ProjectOpenProfile {
            id: "vscode".to_string(),
            name: "VS Code".to_string(),
            kind: ProjectOpenProfileKind::App,
            command: "code".to_string(),
            executable_path: String::new(),
            args: vec!["{projectPath}".to_string()],
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 0,
        },
        ProjectOpenProfile {
            id: "trae".to_string(),
            name: "Trae".to_string(),
            kind: ProjectOpenProfileKind::App,
            command: "trae".to_string(),
            executable_path: String::new(),
            args: vec!["{projectPath}".to_string()],
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 1,
        },
        ProjectOpenProfile {
            id: "powershell".to_string(),
            name: "PowerShell".to_string(),
            kind: ProjectOpenProfileKind::Terminal,
            command: "powershell".to_string(),
            executable_path: String::new(),
            args: Vec::new(),
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 2,
        },
        ProjectOpenProfile {
            id: "claude-code".to_string(),
            name: "Claude Code".to_string(),
            kind: ProjectOpenProfileKind::Terminal,
            command: "claude".to_string(),
            executable_path: String::new(),
            args: Vec::new(),
            workdir: "{projectPath}".to_string(),
            enabled: true,
            sort_order: 3,
        },
    ]
}

fn terminal_command_parts(profile: &ProjectOpenProfile) -> Vec<String> {
    let program = profile_program(profile);
    if !profile.executable_path.trim().is_empty() {
        return vec![quote_powershell_arg(&program)];
    }
    split_command_line(&program)
        .iter()
        .map(|part| quote_powershell_arg(part))
        .collect()
}

fn split_command_line(command: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for character in command.chars() {
        match (quote, character) {
            (Some(active), value) if value == active => quote = None,
            (None, '\'' | '"') => quote = Some(character),
            (None, value) if value.is_whitespace() => {
                if !current.is_empty() {
                    parts.push(current);
                    current = String::new();
                }
            }
            _ => current.push(character),
        }
    }

    if !current.is_empty() {
        parts.push(current);
    }

    parts
}

fn quote_powershell_arg(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn spawn_external_command(mut command: Command, profile_name: &str) -> ProjectResult<()> {
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| open_profile_spawn_error(profile_name, error))
}

fn spawn_silent_external_command(mut command: Command, profile_name: &str) -> ProjectResult<()> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    spawn_external_command(command, profile_name)
}

fn open_profile_spawn_error(profile_name: &str, error: std::io::Error) -> String {
    if error.kind() == ErrorKind::NotFound {
        format!("无法启动 {profile_name}，请检查命令是否已加入 PATH，或在设置中选择可执行文件。")
    } else {
        format!("无法启动 {profile_name}: {error}")
    }
}

pub(crate) fn project_open_profile_kind_name(kind: &ProjectOpenProfileKind) -> &'static str {
    match kind {
        ProjectOpenProfileKind::App => "app",
        ProjectOpenProfileKind::Terminal => "terminal",
    }
}
