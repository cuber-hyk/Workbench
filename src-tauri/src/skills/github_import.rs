use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde_json::Value;
use tempfile::tempdir;
use walkdir::WalkDir;
use zip::ZipArchive;

use super::{
    configured_github_api_token, copy_directory, current_settings, directories_match,
    directory_content_hash, error_message, import_skill_directory_with_overwrite,
    parse_skill_markdown, upsert_skill_source_record, validate_directory_name,
    GithubSkillImportCandidate, GithubSkillImportInspection, GithubSkillImportSelection,
    GithubTokenStatus, ImportResult, SkillResult, SkillSourceRecord,
};

const GITHUB_ARCHIVE_MAX_BYTES: u64 = 80 * 1024 * 1024;
const GITHUB_ARCHIVE_MAX_FILES: usize = 6000;
const GITHUB_GIT_TIMEOUT_SECS: u64 = 300;
const GITHUB_API_ROOT: &str = "https://api.github.com";

#[derive(Debug, Clone, PartialEq, Eq)]
struct GithubImportRequest {
    owner: String,
    repo: String,
    ref_name: Option<String>,
    scope_path: String,
}

#[derive(Debug)]
struct ExtractedGithubArchive {
    _temporary: tempfile::TempDir,
    root: PathBuf,
}

#[derive(Debug)]
struct PreparedGithubRepository {
    _temporary: tempfile::TempDir,
    root: PathBuf,
    ref_name: String,
    revision: String,
    fixed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum GithubApiFailure {
    Auth(String),
    Other(String),
}

pub(super) fn inspect_github_skill_import_state(
    url: String,
) -> SkillResult<GithubSkillImportInspection> {
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = super::db::open_database(&workbench_root)?;
    let token = configured_github_api_token(&connection)?;
    inspect_github_skill_import_in(url, Path::new(&settings.skills_root), token.as_deref())
}

pub(super) fn import_github_skills_state(
    url: String,
    selections: Vec<GithubSkillImportSelection>,
) -> SkillResult<Vec<ImportResult>> {
    if selections.is_empty() {
        return Err("请选择要导入的 GitHub Skill".to_string());
    }
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let skills_root = PathBuf::from(&settings.skills_root);
    let connection = super::db::open_database(&workbench_root)?;
    let token = configured_github_api_token(&connection)?;
    import_github_skills_in(
        url,
        selections,
        &connection,
        &workbench_root,
        &skills_root,
        token.as_deref(),
    )
}

fn inspect_github_skill_import_in(
    url: String,
    skills_root: &Path,
    token: Option<&str>,
) -> SkillResult<GithubSkillImportInspection> {
    let request = parse_github_skill_url(&url)?;
    let repository = prepare_github_repository(&request, token)?;
    let scope = scoped_archive_path(&repository.root, &request.scope_path)?;
    let candidates =
        scan_github_skill_candidates(&scope, &repository.root, skills_root, &request.repo)?;
    Ok(GithubSkillImportInspection {
        repo_url: format!("https://github.com/{}/{}", request.owner, request.repo),
        owner: request.owner,
        repo: request.repo,
        ref_name: repository.ref_name,
        resolved_ref: repository.revision,
        fixed_ref: repository.fixed,
        scope_path: normalize_relative_path(&request.scope_path),
        message: if candidates.is_empty() {
            "没有发现包含 SKILL.md 的标准 Skill 目录".to_string()
        } else {
            format!("发现 {} 个 Skill 候选", candidates.len())
        },
        candidates,
    })
}

fn import_github_skills_in(
    url: String,
    selections: Vec<GithubSkillImportSelection>,
    connection: &Connection,
    workbench_root: &Path,
    skills_root: &Path,
    token: Option<&str>,
) -> SkillResult<Vec<ImportResult>> {
    let request = parse_github_skill_url(&url)?;
    let repository = prepare_github_repository(&request, token)?;
    let scope = scoped_archive_path(&repository.root, &request.scope_path)?;
    let candidates =
        scan_github_skill_candidates(&scope, &repository.root, skills_root, &request.repo)?;
    let mut results = Vec::new();

    for selection in selections {
        let normalized_path = normalize_relative_path(&selection.skill_path);
        let Some(candidate) = candidates
            .iter()
            .find(|candidate| candidate.skill_path == normalized_path)
        else {
            results.push(ImportResult {
                directory_name: normalized_path,
                status: super::ImportStatus::Invalid,
                message: "选中的 Skill 不在本次 GitHub 扫描候选中".to_string(),
            });
            continue;
        };
        if validate_directory_name(&candidate.directory_name).is_err() {
            results.push(ImportResult {
                directory_name: candidate.directory_name.clone(),
                status: super::ImportStatus::Invalid,
                message: "Skill 目录名称无效".to_string(),
            });
            continue;
        }

        let source = repository.root.join(&candidate.skill_path);
        let result = import_github_candidate_directory(
            &source,
            &candidate.directory_name,
            skills_root,
            selection.overwrite,
            workbench_root,
        )?;
        if result.status == super::ImportStatus::Imported {
            let hash = directory_content_hash(&source)?;
            let record = SkillSourceRecord {
                directory_name: candidate.directory_name.clone(),
                source: "github".to_string(),
                package_slug: github_package_slug(&request, &candidate.skill_path),
                repo_url: format!("https://github.com/{}/{}", request.owner, request.repo),
                skill_path: candidate.skill_path.clone(),
                installed_ref: github_installed_ref(&repository),
                installed_hash: hash.clone(),
                remote_ref: hash,
                last_checked_at: String::new(),
                installed_at: String::new(),
                updated_at: String::new(),
            };
            upsert_skill_source_record(connection, &record)?;
        }
        results.push(result);
    }

    Ok(results)
}

pub(super) fn extract_github_remote_skill(
    record: &SkillSourceRecord,
) -> SkillResult<(tempfile::TempDir, PathBuf, String, String)> {
    let request = request_from_source_record(record)?;
    let settings = current_settings()?;
    let connection = super::db::open_database(Path::new(&settings.workbench_root))?;
    let token = configured_github_api_token(&connection)?;
    let repository = prepare_github_repository(&request, token.as_deref())?;
    if repository.fixed {
        return Err("GitHub 固定版本来源不支持检查更新".to_string());
    }
    let skill_path = normalize_relative_path(&record.skill_path);
    let skill_source = repository.root.join(&skill_path);
    if !skill_source.join("SKILL.md").is_file() {
        return Err("远端 GitHub 来源中不存在原 Skill 路径".to_string());
    }
    let hash = directory_content_hash(&skill_source)?;
    Ok((repository._temporary, skill_source, skill_path, hash))
}

pub(super) fn github_source_is_fixed(record: &SkillSourceRecord) -> bool {
    record.installed_ref.starts_with("tag:") || record.installed_ref.starts_with("commit:")
}

pub(super) fn test_github_api_token_state(token: Option<String>) -> SkillResult<GithubTokenStatus> {
    let token = match token {
        Some(value) if !value.trim().is_empty() => value.trim().to_string(),
        _ => {
            let settings = current_settings()?;
            let connection = super::db::open_database(Path::new(&settings.workbench_root))?;
            configured_github_api_token(&connection)?
                .ok_or_else(|| "尚未配置 GitHub Token".to_string())?
        }
    };
    match github_api_json("/user", &token) {
        Ok(_) => Ok(GithubTokenStatus {
            configured: true,
            message: "GitHub Token 可用".to_string(),
        }),
        Err(GithubApiFailure::Auth(message)) | Err(GithubApiFailure::Other(message)) => {
            Err(message)
        }
    }
}

fn parse_github_skill_url(url: &str) -> SkillResult<GithubImportRequest> {
    let trimmed = url.trim().trim_end_matches('/');
    let path = trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("http://github.com/"))
        .ok_or_else(|| "只支持 https://github.com/<owner>/<repo> 链接".to_string())?;
    let mut parts = path.split('/').collect::<Vec<_>>();
    if parts.len() < 2 {
        return Err("GitHub 链接缺少 owner 或 repo".to_string());
    }
    let owner = clean_github_segment(parts[0])?;
    let repo = clean_github_segment(parts[1].trim_end_matches(".git"))?;
    if parts.len() == 2 {
        return Ok(GithubImportRequest {
            owner,
            repo,
            ref_name: None,
            scope_path: String::new(),
        });
    }
    let mode = parts[2];
    if mode != "tree" && mode != "blob" {
        return Err("GitHub 链接仅支持仓库、tree 路径或 SKILL.md 文件".to_string());
    }
    parts.drain(0..3);
    let (ref_name, relative) = split_ref_and_path(&owner, &repo, &parts)?;
    let mut scope_path = relative.join("/");
    if mode == "blob" {
        if !scope_path.ends_with("SKILL.md") {
            return Err("GitHub blob 链接必须指向 SKILL.md".to_string());
        }
        scope_path = scope_path
            .trim_end_matches("SKILL.md")
            .trim_end_matches('/')
            .to_string();
    }
    Ok(GithubImportRequest {
        owner,
        repo,
        ref_name: Some(ref_name),
        scope_path,
    })
}

fn split_ref_and_path(
    _owner: &str,
    _repo: &str,
    parts: &[&str],
) -> SkillResult<(String, Vec<String>)> {
    if parts.is_empty() {
        return Err("GitHub tree/blob 链接缺少 ref".to_string());
    }
    Ok((
        parts[0].to_string(),
        parts[1..].iter().map(|part| part.to_string()).collect(),
    ))
}

fn prepare_github_repository(
    request: &GithubImportRequest,
    token: Option<&str>,
) -> SkillResult<PreparedGithubRepository> {
    if let Some(ref_name) = request
        .ref_name
        .as_deref()
        .filter(|value| looks_like_commit(value))
    {
        let archive = download_and_extract_archive(request, ref_name)?;
        return Ok(PreparedGithubRepository {
            _temporary: archive._temporary,
            root: archive.root,
            ref_name: ref_name.to_string(),
            revision: ref_name.to_string(),
            fixed: true,
        });
    }

    if let Some(token) = token.filter(|value| !value.trim().is_empty()) {
        match prepare_github_repository_with_api(request, token.trim()) {
            Ok(repository) => return Ok(repository),
            Err(GithubApiFailure::Auth(message)) => return Err(message),
            Err(GithubApiFailure::Other(_)) => {}
        }
    }

    clone_github_repository(request)
}

fn prepare_github_repository_with_api(
    request: &GithubImportRequest,
    token: &str,
) -> Result<PreparedGithubRepository, GithubApiFailure> {
    let repository = github_api_json(&format!("/repos/{}/{}", request.owner, request.repo), token)?;
    if repository
        .get("private")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err(GithubApiFailure::Auth(
            "当前只支持 public GitHub 仓库".to_string(),
        ));
    }
    let default_branch = repository
        .get("default_branch")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| GithubApiFailure::Other("GitHub API 未返回默认分支".to_string()))?;
    let requested_ref = request
        .ref_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(default_branch);

    let branch_path = format!(
        "/repos/{}/{}/branches/{}",
        request.owner,
        request.repo,
        encode_api_path_value(requested_ref)
    );
    let (revision, fixed) = match github_api_json(&branch_path, token) {
        Ok(branch) => {
            let sha = branch
                .pointer("/commit/sha")
                .and_then(Value::as_str)
                .ok_or_else(|| GithubApiFailure::Other("GitHub API 未返回分支提交".to_string()))?;
            (sha.to_string(), false)
        }
        Err(GithubApiFailure::Auth(message)) => return Err(GithubApiFailure::Auth(message)),
        Err(GithubApiFailure::Other(_)) => {
            let commit = github_api_json(
                &format!(
                    "/repos/{}/{}/commits/{}",
                    request.owner,
                    request.repo,
                    encode_api_path_value(requested_ref)
                ),
                token,
            )?;
            let sha = commit
                .get("sha")
                .and_then(Value::as_str)
                .ok_or_else(|| GithubApiFailure::Other("GitHub API 未返回提交 SHA".to_string()))?;
            (sha.to_string(), true)
        }
    };
    let archive = download_and_extract_api_zipball(request, requested_ref, token)?;
    Ok(PreparedGithubRepository {
        _temporary: archive._temporary,
        root: archive.root,
        ref_name: requested_ref.to_string(),
        revision,
        fixed,
    })
}

fn clone_github_repository(request: &GithubImportRequest) -> SkillResult<PreparedGithubRepository> {
    let temporary = tempdir().map_err(error_message)?;
    let root = temporary.path().join("repo");
    let clone_url = github_clone_url(&request.owner, &request.repo);
    let mut args = vec!["clone".to_string(), "--depth".to_string(), "1".to_string()];
    if let Some(ref_name) = request
        .ref_name
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        args.push("--branch".to_string());
        args.push(ref_name.to_string());
    }
    args.push(clone_url);
    args.push(root.to_string_lossy().to_string());

    run_git_command(&args, None)?;
    let revision = git_command_output(&["rev-parse", "HEAD"], Some(&root))?;
    let checked_out_branch = git_command_output(&["branch", "--show-current"], Some(&root)).ok();
    let ref_name = request
        .ref_name
        .clone()
        .or_else(|| checked_out_branch.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "HEAD".to_string());
    let fixed = request.ref_name.is_some()
        && checked_out_branch
            .as_deref()
            .is_none_or(|branch| branch.trim().is_empty());

    Ok(PreparedGithubRepository {
        _temporary: temporary,
        root,
        ref_name,
        revision,
        fixed,
    })
}

fn github_clone_url(owner: &str, repo: &str) -> String {
    format!("https://github.com/{owner}/{repo}.git")
}

fn git_command() -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new("git");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

fn run_git_command(args: &[String], working_directory: Option<&Path>) -> SkillResult<()> {
    let mut command = git_command();
    if let Some(directory) = working_directory {
        command.current_dir(directory);
    }
    command
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 git，请确认已安装 Git 并可在 PATH 中访问: {error}"))?;
    let deadline = Instant::now() + Duration::from_secs(GITHUB_GIT_TIMEOUT_SECS);
    loop {
        match child.try_wait().map_err(error_message)? {
            Some(status) => {
                if status.success() {
                    return Ok(());
                }
                let mut stderr = String::new();
                if let Some(mut pipe) = child.stderr.take() {
                    let _ = pipe.read_to_string(&mut stderr);
                }
                let detail = stderr.trim();
                return if detail.is_empty() {
                    Err(format!("git 命令执行失败: {status}"))
                } else {
                    Err(format!("git 命令执行失败: {detail}"))
                };
            }
            None => {
                if Instant::now() > deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("GitHub 仓库克隆超时，请检查网络后重试".to_string());
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

fn git_command_output(args: &[&str], working_directory: Option<&Path>) -> SkillResult<String> {
    let mut command = git_command();
    if let Some(directory) = working_directory {
        command.current_dir(directory);
    }
    let output = command
        .args(args)
        .output()
        .map_err(|error| format!("无法启动 git，请确认已安装 Git 并可在 PATH 中访问: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return if detail.is_empty() {
            Err(format!("git 命令执行失败: {}", output.status))
        } else {
            Err(format!("git 命令执行失败: {detail}"))
        };
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn download_and_extract_archive(
    request: &GithubImportRequest,
    ref_name: &str,
) -> SkillResult<ExtractedGithubArchive> {
    let url = format!(
        "https://codeload.github.com/{}/{}/zip/{}",
        request.owner,
        request.repo,
        encode_ref_path(ref_name)
    );
    let mut response = ureq::get(&url)
        .set("User-Agent", "Workbench-App/0.1")
        .call()
        .map_err(|error| format!("下载 GitHub 仓库失败: {error}"))?
        .into_reader()
        .take(GITHUB_ARCHIVE_MAX_BYTES + 1);
    let mut bytes = Vec::new();
    response.read_to_end(&mut bytes).map_err(error_message)?;
    if bytes.len() as u64 > GITHUB_ARCHIVE_MAX_BYTES {
        return Err("GitHub 仓库归档超过大小限制".to_string());
    }
    extract_zip_bytes(bytes)
}

fn download_and_extract_api_zipball(
    request: &GithubImportRequest,
    ref_name: &str,
    token: &str,
) -> Result<ExtractedGithubArchive, GithubApiFailure> {
    let url = format!(
        "{GITHUB_API_ROOT}/repos/{}/{}/zipball/{}",
        request.owner,
        request.repo,
        encode_ref_path(ref_name)
    );
    let mut response = github_api_request(&url, token)
        .call()
        .map_err(github_api_failure)?
        .into_reader()
        .take(GITHUB_ARCHIVE_MAX_BYTES + 1);
    let mut bytes = Vec::new();
    response
        .read_to_end(&mut bytes)
        .map_err(|error| GithubApiFailure::Other(error.to_string()))?;
    if bytes.len() as u64 > GITHUB_ARCHIVE_MAX_BYTES {
        return Err(GithubApiFailure::Other(
            "GitHub 仓库归档超过大小限制".to_string(),
        ));
    }
    extract_zip_bytes(bytes).map_err(GithubApiFailure::Other)
}

fn github_api_json(path: &str, token: &str) -> Result<Value, GithubApiFailure> {
    let url = format!("{GITHUB_API_ROOT}{path}");
    github_api_request(&url, token)
        .call()
        .map_err(github_api_failure)?
        .into_json::<Value>()
        .map_err(|error| GithubApiFailure::Other(format!("解析 GitHub API 响应失败: {error}")))
}

fn github_api_request(url: &str, token: &str) -> ureq::Request {
    ureq::get(url)
        .set("User-Agent", "Workbench-App/0.1")
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .set("Authorization", &format!("Bearer {}", token.trim()))
}

fn github_api_failure(error: ureq::Error) -> GithubApiFailure {
    match error {
        ureq::Error::Status(status, response) if status == 401 || status == 403 => {
            let message = response
                .into_json::<Value>()
                .ok()
                .and_then(|value| {
                    value
                        .get("message")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_default();
            if message.to_ascii_lowercase().contains("rate limit") {
                GithubApiFailure::Auth(
                    "GitHub Token 已触发 API 限流，请稍后重试或更换 Token".to_string(),
                )
            } else {
                GithubApiFailure::Auth("GitHub Token 无效、过期或权限不足".to_string())
            }
        }
        ureq::Error::Status(status, _) => {
            GithubApiFailure::Other(format!("GitHub API 请求失败: status code {status}"))
        }
        ureq::Error::Transport(error) => {
            GithubApiFailure::Other(format!("GitHub API 网络请求失败: {error}"))
        }
    }
}

fn extract_zip_bytes(bytes: Vec<u8>) -> SkillResult<ExtractedGithubArchive> {
    let temporary = tempdir().map_err(error_message)?;
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(error_message)?;
    if archive.len() > GITHUB_ARCHIVE_MAX_FILES {
        return Err("GitHub 仓库文件数量超过限制".to_string());
    }
    let mut root: Option<PathBuf> = None;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(error_message)?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| "GitHub 仓库归档中包含不安全路径".to_string())?;
        if root.is_none() {
            if let Some(Component::Normal(first)) = relative.components().next() {
                root = Some(temporary.path().join(first));
            }
        }
        let destination = temporary.path().join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(error_message)?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(error_message)?;
        }
        let mut output = fs::File::create(destination).map_err(error_message)?;
        std::io::copy(&mut entry, &mut output).map_err(error_message)?;
    }
    let root = root.ok_or_else(|| "GitHub 仓库归档为空".to_string())?;
    Ok(ExtractedGithubArchive {
        _temporary: temporary,
        root,
    })
}

fn scan_github_skill_candidates(
    scope: &Path,
    archive_root: &Path,
    skills_root: &Path,
    repo_name: &str,
) -> SkillResult<Vec<GithubSkillImportCandidate>> {
    if !scope.is_dir() {
        return Err("GitHub 链接指向的目录不存在".to_string());
    }
    let mut candidates = Vec::new();
    for entry in WalkDir::new(scope).follow_links(false) {
        let entry = entry.map_err(error_message)?;
        if !entry.file_type().is_file() || entry.file_name() != "SKILL.md" {
            continue;
        }
        let Some(skill_dir) = entry.path().parent() else {
            continue;
        };
        let relative = normalize_relative_path(
            &skill_dir
                .strip_prefix(archive_root)
                .map_err(error_message)?
                .to_string_lossy(),
        );
        let markdown = fs::read_to_string(entry.path()).map_err(error_message)?;
        let fallback_name = skill_dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| repo_name.to_string());
        let metadata = parse_skill_markdown(&markdown, &fallback_name);
        let directory_name = github_candidate_directory_name(skill_dir, archive_root, repo_name);
        let display_name = metadata.name.clone();
        let (file_count, total_size, has_scripts) = skill_directory_summary(skill_dir)?;
        let status = github_candidate_status(skill_dir, skills_root, &directory_name)?;
        candidates.push(GithubSkillImportCandidate {
            directory_name: directory_name.clone(),
            display_name,
            description: metadata.description,
            skill_path: relative,
            markdown_preview: markdown.chars().take(4000).collect(),
            file_count,
            total_size,
            has_scripts,
            status,
            message: candidate_message(status),
        });
    }
    candidates.sort_by(|left, right| left.skill_path.cmp(&right.skill_path));
    Ok(candidates)
}

fn github_candidate_directory_name(
    skill_dir: &Path,
    archive_root: &Path,
    repo_name: &str,
) -> String {
    if skill_dir == archive_root {
        repo_name.to_string()
    } else {
        skill_dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| repo_name.to_string())
    }
}

fn github_candidate_status(
    source: &Path,
    target_root: &Path,
    directory_name: &str,
) -> SkillResult<super::ExternalSkillCandidateStatus> {
    if validate_directory_name(directory_name).is_err() {
        return Ok(super::ExternalSkillCandidateStatus::Invalid);
    }
    let target = target_root.join(directory_name);
    if target.exists() || target.symlink_metadata().is_ok() {
        if target.is_dir() && directories_match(source, &target)? {
            Ok(super::ExternalSkillCandidateStatus::SameAsCurrent)
        } else {
            Ok(super::ExternalSkillCandidateStatus::Conflict)
        }
    } else {
        Ok(super::ExternalSkillCandidateStatus::New)
    }
}

fn import_github_candidate_directory(
    source: &Path,
    directory_name: &str,
    skills_root: &Path,
    overwrite: bool,
    workbench_root: &Path,
) -> SkillResult<ImportResult> {
    if source.file_name().and_then(|name| name.to_str()) == Some(directory_name) {
        return import_skill_directory_with_overwrite(
            source,
            skills_root,
            overwrite,
            workbench_root,
        );
    }

    let temporary = tempdir().map_err(error_message)?;
    let staged = temporary.path().join(directory_name);
    copy_directory(source, &staged)?;
    import_skill_directory_with_overwrite(&staged, skills_root, overwrite, workbench_root)
}

fn skill_directory_summary(skill_dir: &Path) -> SkillResult<(usize, u64, bool)> {
    let mut file_count = 0;
    let mut total_size = 0;
    let mut has_scripts = false;
    for entry in WalkDir::new(skill_dir).follow_links(false) {
        let entry = entry.map_err(error_message)?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(skill_dir)
            .map_err(error_message)?;
        if relative.components().any(|part| part.as_os_str() == ".git") {
            continue;
        }
        file_count += 1;
        total_size += entry.metadata().map_err(error_message)?.len();
        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if matches!(
            extension.as_str(),
            "sh" | "ps1" | "bat" | "cmd" | "js" | "ts" | "py"
        ) {
            has_scripts = true;
        }
    }
    Ok((file_count, total_size, has_scripts))
}

fn request_from_source_record(record: &SkillSourceRecord) -> SkillResult<GithubImportRequest> {
    if record.source != "github" {
        return Err("来源不是 GitHub".to_string());
    }
    let repo = parse_github_skill_url(&record.repo_url)?;
    let ref_name = record
        .installed_ref
        .split_once(':')
        .map(|(_, value)| value)
        .unwrap_or(&record.installed_ref)
        .split_once('@')
        .map(|(value, _)| value)
        .unwrap_or_else(|| {
            record
                .installed_ref
                .split_once(':')
                .map(|(_, value)| value)
                .unwrap_or(&record.installed_ref)
        })
        .to_string();
    Ok(GithubImportRequest {
        ref_name: Some(ref_name),
        scope_path: record.skill_path.clone(),
        ..repo
    })
}

fn scoped_archive_path(root: &Path, scope_path: &str) -> SkillResult<PathBuf> {
    let normalized = normalize_relative_path(scope_path);
    if normalized.is_empty() {
        return Ok(root.to_path_buf());
    }
    if normalized.split('/').any(|part| part == "..") {
        return Err("GitHub 路径不安全".to_string());
    }
    let scoped = root.join(&normalized);
    if !scoped.starts_with(root) {
        return Err("GitHub 路径不安全".to_string());
    }
    Ok(scoped)
}

fn clean_github_segment(segment: &str) -> SkillResult<String> {
    let valid = !segment.is_empty()
        && segment.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        });
    valid
        .then(|| segment.to_string())
        .ok_or_else(|| "GitHub owner/repo 格式无效".to_string())
}

fn normalize_relative_path(path: &str) -> String {
    path.replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect::<Vec<_>>()
        .join("/")
}

fn github_package_slug(request: &GithubImportRequest, skill_path: &str) -> String {
    format!(
        "{}/{}/{}",
        request.owner,
        request.repo,
        normalize_relative_path(skill_path)
    )
}

fn github_installed_ref(repository: &PreparedGithubRepository) -> String {
    let prefix = if repository.fixed {
        if looks_like_commit(&repository.ref_name) {
            "commit"
        } else {
            "tag"
        }
    } else {
        "branch"
    };
    format!("{prefix}:{}@{}", repository.ref_name, repository.revision)
}

fn candidate_message(status: super::ExternalSkillCandidateStatus) -> String {
    match status {
        super::ExternalSkillCandidateStatus::New => "可导入".to_string(),
        super::ExternalSkillCandidateStatus::SameAsCurrent => {
            "统一根目录中已存在相同内容".to_string()
        }
        super::ExternalSkillCandidateStatus::Conflict => {
            "统一根目录中已存在同名不同内容 Skill".to_string()
        }
        super::ExternalSkillCandidateStatus::Invalid => "Skill 目录名称无效".to_string(),
        super::ExternalSkillCandidateStatus::Unreadable => "候选目录不可读".to_string(),
    }
}

fn encode_ref_path(value: &str) -> String {
    value
        .split('/')
        .map(encode_path_segment)
        .collect::<Vec<_>>()
        .join("/")
}

fn encode_api_path_value(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect::<Vec<_>>(),
        })
        .collect()
}

fn encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect::<Vec<_>>(),
        })
        .collect()
}

fn looks_like_commit(value: &str) -> bool {
    value.len() == 40 && value.chars().all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parses_repo_tree_and_skill_blob_urls() {
        let repo = parse_github_skill_url("https://github.com/acme/skills").unwrap();
        assert_eq!(repo.owner, "acme");
        assert_eq!(repo.repo, "skills");
        assert_eq!(repo.ref_name, None);
        assert_eq!(repo.scope_path, "");

        let tree = parse_github_skill_url("https://github.com/acme/skills/tree/main/packages/foo")
            .unwrap();
        assert_eq!(tree.ref_name, Some("main".to_string()));
        assert_eq!(tree.scope_path, "packages/foo");

        let blob = parse_github_skill_url(
            "https://github.com/acme/skills/blob/main/packages/foo/SKILL.md",
        )
        .unwrap();
        assert_eq!(blob.ref_name, Some("main".to_string()));
        assert_eq!(blob.scope_path, "packages/foo");
    }

    #[test]
    fn scans_standard_skill_candidates() {
        let archive_root = tempdir().unwrap();
        let skills_root = tempdir().unwrap();
        let root_skill = archive_root.path().join("root-skill");
        let nested_skill = archive_root.path().join("collection/nested-skill");
        fs::create_dir_all(&root_skill).unwrap();
        fs::create_dir_all(&nested_skill).unwrap();
        fs::write(
            root_skill.join("SKILL.md"),
            "---\nname: Root\ndescription: Root skill\n---\n",
        )
        .unwrap();
        fs::write(nested_skill.join("SKILL.md"), "# Nested").unwrap();
        fs::write(nested_skill.join("script.sh"), "echo hi").unwrap();
        fs::create_dir_all(nested_skill.join(".git/objects")).unwrap();
        fs::write(nested_skill.join(".git/objects/ignored"), "metadata").unwrap();

        let candidates = scan_github_skill_candidates(
            archive_root.path(),
            archive_root.path(),
            skills_root.path(),
            "paper-reading-skills",
        )
        .unwrap();

        assert_eq!(candidates.len(), 2);
        let root = candidates
            .iter()
            .find(|candidate| candidate.skill_path == "root-skill")
            .unwrap();
        assert_eq!(root.directory_name, "root-skill");
        let nested = candidates
            .iter()
            .find(|candidate| candidate.skill_path == "collection/nested-skill")
            .unwrap();
        assert!(nested.has_scripts);
        assert_eq!(nested.file_count, 2);
    }

    #[test]
    fn root_skill_candidate_uses_repo_name_as_directory_name() {
        let archive_root = tempdir().unwrap();
        let skills_root = tempdir().unwrap();
        fs::write(
            archive_root.path().join("SKILL.md"),
            "---\nname: PaperReading\ndescription: Root skill\n---\n",
        )
        .unwrap();

        let candidates = scan_github_skill_candidates(
            archive_root.path(),
            archive_root.path(),
            skills_root.path(),
            "PaperReading-skills",
        )
        .unwrap();

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].skill_path, "");
        assert_eq!(candidates[0].directory_name, "PaperReading-skills");
        assert_eq!(candidates[0].display_name, "PaperReading");
    }

    #[test]
    fn rejects_parent_traversal_scope() {
        let archive_root = tempdir().unwrap();
        let error = scoped_archive_path(archive_root.path(), "../outside").unwrap_err();

        assert_eq!(error, "GitHub 路径不安全");
    }

    #[test]
    fn api_path_encoding_escapes_slashes_in_ref_names() {
        assert_eq!(
            encode_api_path_value("feature/github-token"),
            "feature%2Fgithub-token"
        );
        assert_eq!(
            encode_ref_path("feature/github-token"),
            "feature/github-token"
        );
    }

    #[test]
    fn stores_branch_ref_from_prepared_repository() {
        let temporary = tempdir().unwrap();
        let repository = PreparedGithubRepository {
            root: temporary.path().to_path_buf(),
            _temporary: temporary,
            ref_name: "main".to_string(),
            revision: "abc".to_string(),
            fixed: false,
        };

        assert_eq!(github_installed_ref(&repository), "branch:main@abc");
    }

    #[test]
    fn stores_fixed_commit_ref_from_prepared_repository() {
        let temporary = tempdir().unwrap();
        let revision = "0123456789abcdef0123456789abcdef01234567".to_string();
        let repository = PreparedGithubRepository {
            root: temporary.path().to_path_buf(),
            _temporary: temporary,
            ref_name: revision.clone(),
            revision: revision.clone(),
            fixed: true,
        };

        assert_eq!(
            github_installed_ref(&repository),
            format!("commit:{revision}@{revision}")
        );
    }
}
