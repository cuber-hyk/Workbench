use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use tempfile::tempdir;

use super::{directory_content_hash, error_message, market::github_source, SkillResult};

const SKILLS_CLI_TIMEOUT_SECONDS: u64 = 180;
const SKILLS_CLI_ERROR_DETAIL_LIMIT: usize = 700;

pub(super) fn skills_cli_command_name(command: &str) -> String {
    if cfg!(windows) && matches!(command, "npm" | "npx") {
        format!("{command}.cmd")
    } else {
        command.to_string()
    }
}

pub(super) fn skills_cli_install_args(source: &str, skill_id: &str) -> Vec<String> {
    [
        "-y", "skills", "add", source, "--skill", skill_id, "-g", "--agent", "codex", "-y",
        "--copy",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

pub(super) fn skills_cli_app_data(home: &Path) -> PathBuf {
    home.join("AppData").join("Roaming")
}

pub(super) fn skills_cli_skill_path(home: &Path, skill_id: &str) -> PathBuf {
    home.join(".agents").join("skills").join(skill_id)
}

pub(super) fn missing_skills_cli_dependency_message(missing: &[&str]) -> String {
    format!(
        "未检测到 {}，无法调用 skills.sh 官方安装器。请安装 Node.js LTS，并确认 npm/npx 可在终端中使用后重试。",
        missing.join("、")
    )
}

fn require_skills_cli_dependencies() -> SkillResult<()> {
    let mut missing = Vec::new();
    for command in ["node", "npm", "npx"] {
        let status = Command::new(skills_cli_command_name(command))
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if !matches!(status, Ok(status) if status.success()) {
            missing.push(command);
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing_skills_cli_dependency_message(&missing))
    }
}

fn run_command_with_timeout(command: &mut Command, timeout: Duration) -> SkillResult<Output> {
    let mut child = command.spawn().map_err(|error| {
        format!("无法启动 skills.sh 官方安装器：{error}。请确认 Node.js/npm/npx 已正确安装。")
    })?;
    let started_at = Instant::now();
    loop {
        match child.try_wait().map_err(error_message)? {
            Some(_) => return child.wait_with_output().map_err(error_message),
            None if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("skills.sh 官方安装器执行超时，请检查网络后重试。".to_string());
            }
            None => thread::sleep(Duration::from_millis(150)),
        }
    }
}

fn skills_cli_output_text(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return clean_skills_cli_output(&stderr);
    }
    clean_skills_cli_output(&String::from_utf8_lossy(&output.stdout))
}

fn skills_cli_failure_message(output: &Output) -> String {
    let detail = skills_cli_output_text(output);
    if detail.is_empty() {
        "skills.sh 官方安装器执行失败，请检查网络或稍后重试。".to_string()
    } else {
        format!("skills.sh 官方安装器执行失败：{detail}")
    }
}

pub(super) fn clean_skills_cli_output(value: &str) -> String {
    let without_ansi = strip_ansi_sequences(value);
    let without_controls: String = without_ansi
        .chars()
        .map(|character| {
            if character.is_control() && !matches!(character, '\n' | '\t') {
                ' '
            } else {
                character
            }
        })
        .collect();
    let compact = without_controls
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .fold(Vec::<String>::new(), |mut lines, line| {
            if lines.last() != Some(&line) {
                lines.push(line);
            }
            lines
        })
        .join("\n");
    let compact = compact_repeated_fetching(&compact);
    truncate_for_message(&compact, SKILLS_CLI_ERROR_DETAIL_LIMIT)
}

fn strip_ansi_sequences(value: &str) -> String {
    let mut output = String::new();
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if character != '\u{1b}' {
            output.push(character);
            continue;
        }
        if matches!(chars.peek(), Some('[' | ']')) {
            let introducer = chars.next();
            for next in chars.by_ref() {
                if introducer == Some(']') && next == '\u{7}' {
                    break;
                }
                if introducer == Some('[') && ('@'..='~').contains(&next) {
                    break;
                }
            }
        }
    }
    output
}

fn compact_repeated_fetching(value: &str) -> String {
    let mut output = value.to_string();
    let repeated = "Fetching skills. Fetching skills.";
    while output.contains(repeated) {
        output = output.replace(repeated, "Fetching skills.");
    }
    output
}

fn truncate_for_message(value: &str, limit: usize) -> String {
    if value.chars().count() <= limit {
        return value.to_string();
    }
    let mut truncated = value.chars().take(limit).collect::<String>();
    truncated.push_str("...");
    truncated
}

pub(super) fn extract_skill_with_skills_cli(
    source: &str,
    skill_id: &str,
    on_progress: &dyn Fn(u8),
) -> SkillResult<(tempfile::TempDir, PathBuf, String, String)> {
    if !github_source(source) {
        return Err("当前仅支持 GitHub owner/repo 格式的 skills.sh 来源".to_string());
    }
    on_progress(12);
    require_skills_cli_dependencies()?;
    on_progress(20);
    let temporary = tempdir().map_err(error_message)?;
    let app_data = skills_cli_app_data(temporary.path());
    fs::create_dir_all(&app_data).map_err(error_message)?;
    let mut command = Command::new(skills_cli_command_name("npx"));
    command
        .args(skills_cli_install_args(source, skill_id))
        .current_dir(temporary.path())
        .env("HOME", temporary.path())
        .env("USERPROFILE", temporary.path())
        .env("APPDATA", &app_data)
        .env("NO_COLOR", "1")
        .env("CI", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    on_progress(45);
    let output = run_command_with_timeout(
        &mut command,
        Duration::from_secs(SKILLS_CLI_TIMEOUT_SECONDS),
    )?;
    if !output.status.success() {
        return Err(skills_cli_failure_message(&output));
    }
    on_progress(72);
    let skill = skills_cli_skill_path(temporary.path(), skill_id);
    if !skill.join("SKILL.md").is_file() {
        return Err(format!(
            "skills.sh 官方安装器未生成 Skill: {skill_id}。请确认该 Skill 是否存在或稍后重试。"
        ));
    }
    let relative = format!(".agents/skills/{skill_id}");
    let hash = directory_content_hash(&skill)?;
    on_progress(84);
    Ok((temporary, skill, relative, hash))
}
