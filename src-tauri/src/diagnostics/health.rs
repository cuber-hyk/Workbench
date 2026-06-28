use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tempfile::tempdir;

const COMMAND_TIMEOUT: Duration = Duration::from_secs(8);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthToolTarget {
    pub key: String,
    pub name: String,
    pub global_skills_dir: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticHealthCheck {
    pub checked_at: String,
    pub items: Vec<HealthCheckItem>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckItem {
    pub key: String,
    pub name: String,
    pub status: HealthCheckStatus,
    pub message: String,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthCheckStatus {
    Ready,
    Missing,
    NeedsConfig,
    NoPermission,
    Failed,
    Skipped,
}

pub fn run_diagnostic_health_check(tool_targets: Vec<HealthToolTarget>) -> DiagnosticHealthCheck {
    let mut items = Vec::new();
    let node = check_command_version("node", "Node.js", "node");
    let npm = check_command_version("npm", "npm", command_name("npm"));
    let npx = check_command_version("npx", "npx", command_name("npx"));
    items.extend([node.clone(), npm.clone(), npx.clone()]);
    items.push(check_github_cli());
    items.push(check_skills_sh_dependencies(&node, &npm, &npx));
    items.push(check_symlink_permission());
    items.extend(check_tool_directories(&tool_targets));

    DiagnosticHealthCheck {
        checked_at: format_timestamp(SystemTime::now()),
        items,
    }
}

fn check_command_version(key: &str, name: &str, command: impl AsRef<str>) -> HealthCheckItem {
    let command = command.as_ref();
    let mut process = Command::new(command);
    process.arg("--version");
    match run_command_with_timeout(&mut process, COMMAND_TIMEOUT) {
        Ok(output) if output.status.success() => {
            let version = output_text(&output);
            HealthCheckItem {
                key: key.to_string(),
                name: name.to_string(),
                status: HealthCheckStatus::Ready,
                message: format!("{name} 可用。"),
                detail: version,
            }
        }
        Ok(output) => HealthCheckItem {
            key: key.to_string(),
            name: name.to_string(),
            status: HealthCheckStatus::Failed,
            message: format!("{name} 命令执行失败。"),
            detail: output_text(&output),
        },
        Err(error) if error.kind() == ErrorKind::NotFound => HealthCheckItem {
            key: key.to_string(),
            name: name.to_string(),
            status: HealthCheckStatus::Missing,
            message: format!("未检测到 {name}。"),
            detail: "请安装 Node.js LTS，并确认命令可在终端中使用。".to_string(),
        },
        Err(error) => HealthCheckItem {
            key: key.to_string(),
            name: name.to_string(),
            status: HealthCheckStatus::Failed,
            message: format!("{name} 检查失败。"),
            detail: error.to_string(),
        },
    }
}

fn check_github_cli() -> HealthCheckItem {
    let mut version_process = Command::new("gh");
    version_process.arg("--version");
    match run_command_with_timeout(&mut version_process, COMMAND_TIMEOUT) {
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return HealthCheckItem {
                key: "github-cli".to_string(),
                name: "GitHub CLI".to_string(),
                status: HealthCheckStatus::Missing,
                message: "未检测到 gh 命令。".to_string(),
                detail: "请安装 GitHub CLI，并运行 gh auth login 登录后重试。".to_string(),
            };
        }
        Err(error) => {
            return HealthCheckItem {
                key: "github-cli".to_string(),
                name: "GitHub CLI".to_string(),
                status: HealthCheckStatus::Failed,
                message: "GitHub CLI 检查失败。".to_string(),
                detail: error.to_string(),
            };
        }
    }

    let mut process = Command::new("gh");
    process.args(["auth", "status"]);
    match run_command_with_timeout(&mut process, COMMAND_TIMEOUT) {
        Ok(output) if output.status.success() => {
            let output = output_text(&output);
            let account = parse_github_cli_account(&output);
            HealthCheckItem {
                key: "github-cli".to_string(),
                name: "GitHub CLI".to_string(),
                status: HealthCheckStatus::Ready,
                message: if account.is_empty() {
                    "GitHub CLI 已就绪。".to_string()
                } else {
                    format!("GitHub CLI 已就绪：当前账号 {account}。")
                },
                detail: output,
            }
        }
        Ok(output) => HealthCheckItem {
            key: "github-cli".to_string(),
            name: "GitHub CLI".to_string(),
            status: HealthCheckStatus::NeedsConfig,
            message: "GitHub CLI 已安装，但尚未登录。".to_string(),
            detail: output_text(&output),
        },
        Err(error) => HealthCheckItem {
            key: "github-cli".to_string(),
            name: "GitHub CLI".to_string(),
            status: HealthCheckStatus::Failed,
            message: "GitHub CLI 登录状态检查失败。".to_string(),
            detail: error.to_string(),
        },
    }
}

fn check_skills_sh_dependencies(
    node: &HealthCheckItem,
    npm: &HealthCheckItem,
    npx: &HealthCheckItem,
) -> HealthCheckItem {
    let missing = [node, npm, npx]
        .into_iter()
        .filter(|item| item.status != HealthCheckStatus::Ready)
        .map(|item| item.name.as_str())
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return HealthCheckItem {
            key: "skills-sh".to_string(),
            name: "skills.sh".to_string(),
            status: HealthCheckStatus::Missing,
            message: "skills.sh 依赖链路不完整。".to_string(),
            detail: format!("缺少或不可用：{}。", missing.join("、")),
        };
    }

    HealthCheckItem {
        key: "skills-sh".to_string(),
        name: "skills.sh".to_string(),
        status: HealthCheckStatus::Skipped,
        message: "Node/npm/npx 可用，未执行在线 skills.sh 检查。".to_string(),
        detail:
            "为避免 npx 自动下载或写入 npm cache，第一版健康检查不主动运行 skills.sh 在线命令。"
                .to_string(),
    }
}

fn check_symlink_permission() -> HealthCheckItem {
    match try_symlink_probe() {
        Ok(()) => HealthCheckItem {
            key: "symlink-permission".to_string(),
            name: "符号链接权限".to_string(),
            status: HealthCheckStatus::Ready,
            message: "当前环境允许创建目录符号链接。".to_string(),
            detail: "已在临时目录完成探测并清理。".to_string(),
        },
        Err(error) if matches!(error.kind(), ErrorKind::PermissionDenied) => HealthCheckItem {
            key: "symlink-permission".to_string(),
            name: "符号链接权限".to_string(),
            status: HealthCheckStatus::NoPermission,
            message: "当前环境不允许创建目录符号链接。".to_string(),
            detail: error.to_string(),
        },
        Err(error) => HealthCheckItem {
            key: "symlink-permission".to_string(),
            name: "符号链接权限".to_string(),
            status: HealthCheckStatus::Failed,
            message: "符号链接权限检查失败。".to_string(),
            detail: error.to_string(),
        },
    }
}

fn check_tool_directories(tool_targets: &[HealthToolTarget]) -> Vec<HealthCheckItem> {
    if tool_targets.is_empty() {
        return vec![HealthCheckItem {
            key: "tool-directories".to_string(),
            name: "工具目录可写性".to_string(),
            status: HealthCheckStatus::Skipped,
            message: "当前没有已配置的工具目录。".to_string(),
            detail: String::new(),
        }];
    }

    tool_targets.iter().map(check_tool_directory).collect()
}

fn check_tool_directory(target: &HealthToolTarget) -> HealthCheckItem {
    let path = PathBuf::from(&target.global_skills_dir);
    let key = format!("tool-directory-{}", target.key);
    if !path.exists() {
        return HealthCheckItem {
            key,
            name: format!("{} 工具目录", target.name),
            status: HealthCheckStatus::Missing,
            message: "工具目录不存在。".to_string(),
            detail: target.global_skills_dir.clone(),
        };
    }
    if !path.is_dir() {
        return HealthCheckItem {
            key,
            name: format!("{} 工具目录", target.name),
            status: HealthCheckStatus::Failed,
            message: "工具目标不是目录。".to_string(),
            detail: target.global_skills_dir.clone(),
        };
    }
    match check_directory_writable(&path) {
        Ok(()) => HealthCheckItem {
            key,
            name: format!("{} 工具目录", target.name),
            status: HealthCheckStatus::Ready,
            message: "工具目录可写。".to_string(),
            detail: target.global_skills_dir.clone(),
        },
        Err(error) if matches!(error.kind(), ErrorKind::PermissionDenied) => HealthCheckItem {
            key,
            name: format!("{} 工具目录", target.name),
            status: HealthCheckStatus::NoPermission,
            message: "工具目录不可写。".to_string(),
            detail: format!("{}：{}", target.global_skills_dir, error),
        },
        Err(error) => HealthCheckItem {
            key,
            name: format!("{} 工具目录", target.name),
            status: HealthCheckStatus::Failed,
            message: "工具目录写入检查失败。".to_string(),
            detail: format!("{}：{}", target.global_skills_dir, error),
        },
    }
}

fn run_command_with_timeout(command: &mut Command, timeout: Duration) -> std::io::Result<Output> {
    configure_hidden_command_window(command);
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let started_at = Instant::now();
    loop {
        match child.try_wait()? {
            Some(_) => return child.wait_with_output(),
            None if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(std::io::Error::new(ErrorKind::TimedOut, "命令执行超时"));
            }
            None => thread::sleep(Duration::from_millis(120)),
        }
    }
}

#[cfg(windows)]
fn configure_hidden_command_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn configure_hidden_command_window(_command: &mut Command) {}

fn output_text(output: &Output) -> String {
    let text = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_github_cli_account(output: &str) -> String {
    output
        .lines()
        .find_map(|line| line.split_once("account "))
        .and_then(|(_prefix, suffix)| suffix.split_whitespace().next())
        .map(|account| account.trim_matches(|character| character == '(' || character == ')'))
        .unwrap_or_default()
        .to_string()
}

fn try_symlink_probe() -> std::io::Result<()> {
    let temporary = tempdir()?;
    let source = temporary.path().join("source");
    let target = temporary.path().join("target");
    fs::create_dir_all(&source)?;
    create_directory_symlink(&source, &target)
}

#[cfg(unix)]
fn create_directory_symlink(source: &Path, target: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}

#[cfg(windows)]
fn create_directory_symlink(source: &Path, target: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_dir(source, target)
}

fn check_directory_writable(path: &Path) -> std::io::Result<()> {
    let file_path = path.join(format!(
        ".workbench-health-check-{}.tmp",
        timestamp_millis(SystemTime::now())
    ));
    fs::write(&file_path, b"workbench-health-check")?;
    fs::remove_file(file_path)
}

fn command_name(command: &str) -> String {
    if cfg!(windows) && matches!(command, "npm" | "npx") {
        format!("{command}.cmd")
    } else {
        command.to_string()
    }
}

fn format_timestamp(time: SystemTime) -> String {
    timestamp_millis(time).to_string()
}

fn timestamp_millis(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_missing_tool_directory_without_creating_it() {
        let temporary = tempdir().unwrap();
        let missing = temporary.path().join("missing");
        let item = check_tool_directory(&HealthToolTarget {
            key: "codex".to_string(),
            name: "Codex".to_string(),
            global_skills_dir: missing.to_string_lossy().to_string(),
        });

        assert_eq!(item.status, HealthCheckStatus::Missing);
        assert!(!missing.exists());
    }

    #[test]
    fn reports_writable_tool_directory_and_removes_probe_file() {
        let temporary = tempdir().unwrap();
        let item = check_tool_directory(&HealthToolTarget {
            key: "codex".to_string(),
            name: "Codex".to_string(),
            global_skills_dir: temporary.path().to_string_lossy().to_string(),
        });

        assert_eq!(item.status, HealthCheckStatus::Ready);
        assert!(fs::read_dir(temporary.path()).unwrap().next().is_none());
    }

    #[test]
    fn skills_sh_is_skipped_when_dependencies_are_ready() {
        let ready = |key: &str, name: &str| HealthCheckItem {
            key: key.to_string(),
            name: name.to_string(),
            status: HealthCheckStatus::Ready,
            message: String::new(),
            detail: String::new(),
        };

        let item = check_skills_sh_dependencies(
            &ready("node", "Node.js"),
            &ready("npm", "npm"),
            &ready("npx", "npx"),
        );

        assert_eq!(item.status, HealthCheckStatus::Skipped);
        assert!(item.message.contains("Node/npm/npx 可用"));
    }

    #[test]
    fn skills_sh_reports_missing_dependency_chain() {
        let node = HealthCheckItem {
            key: "node".to_string(),
            name: "Node.js".to_string(),
            status: HealthCheckStatus::Missing,
            message: String::new(),
            detail: String::new(),
        };
        let ready = HealthCheckItem {
            key: "npm".to_string(),
            name: "npm".to_string(),
            status: HealthCheckStatus::Ready,
            message: String::new(),
            detail: String::new(),
        };

        let item = check_skills_sh_dependencies(&node, &ready, &ready);

        assert_eq!(item.status, HealthCheckStatus::Missing);
        assert!(item.detail.contains("Node.js"));
    }
}
