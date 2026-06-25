use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Emitter, Runtime};

use super::db;
use super::error_message;
use super::types::{
    ProjectImportProgress, ProjectLaunchConfig, ProjectRecord, RemoteProjectImportInspection,
    RemoteProjectImportRequest, RemoteProjectImportStatus,
};
use super::ProjectResult;

#[derive(Debug)]
struct RemoteRepository {
    clone_url: String,
    repo_name: String,
}

pub(crate) fn inspect_remote_project_import(
    workbench_root: &Path,
    request: &RemoteProjectImportRequest,
) -> ProjectResult<RemoteProjectImportInspection> {
    let repository = parse_remote_repository_url(&request.repo_url)?;
    let parent_directory = validate_parent_directory(&request.parent_directory)?;
    let target_directory = parent_directory.join(safe_directory_name(&repository.repo_name)?);
    let target_path = target_directory.to_string_lossy().to_string();
    let connection = db::open_database(workbench_root)?;
    let existing_project = db::load_projects(&connection)?
        .into_iter()
        .find(|project| project.path == target_path);
    let status = match (existing_project.is_some(), target_directory.exists()) {
        (false, false) => RemoteProjectImportStatus::Ready,
        (true, true) => RemoteProjectImportStatus::ManagedExisting,
        (true, false) => RemoteProjectImportStatus::ManagedMissing,
        (false, true) => RemoteProjectImportStatus::UnmanagedExisting,
    };
    Ok(RemoteProjectImportInspection {
        status,
        target_path,
        existing_project,
    })
}

pub(crate) fn import_remote_project_sync<R: Runtime>(
    app: AppHandle<R>,
    workbench_root: PathBuf,
    request: RemoteProjectImportRequest,
) -> ProjectResult<Vec<ProjectRecord>> {
    emit_progress(&app, &request.import_id, 8, "正在校验仓库地址");
    let repository = parse_remote_repository_url(&request.repo_url)?;
    let parent_directory = validate_parent_directory(&request.parent_directory)?;
    let target_directory = parent_directory.join(safe_directory_name(&repository.repo_name)?);
    let inspection = inspect_remote_project_import(&workbench_root, &request)?;
    let project_id = validated_import_project_id(&request, &inspection)?;

    emit_progress(&app, &request.import_id, 18, "正在检查 Git");
    ensure_git_available()?;
    if target_directory.exists() {
        return Err("目标目录已存在，Workbench 不会覆盖已有目录".to_string());
    }

    emit_progress(&app, &request.import_id, 32, "正在克隆仓库");
    let clone_result = clone_repository(&repository.clone_url, &target_directory);
    if let Err(error) = clone_result {
        cleanup_created_target(&target_directory);
        return Err(error);
    }

    let finalizing_message = if inspection.status == RemoteProjectImportStatus::ManagedMissing {
        "正在恢复项目目录"
    } else {
        "正在保存项目记录"
    };
    emit_progress(&app, &request.import_id, 88, finalizing_message);
    let connection = db::open_database(&workbench_root)?;
    let project =
        project_record_for_import(&request, &project_id, &repository.repo_name, &inspection)?;
    if let Err(error) = db::upsert_project(&connection, &project) {
        cleanup_created_target(&target_directory);
        return Err(error);
    }
    let projects = db::load_projects(&connection)?;
    emit_progress(&app, &request.import_id, 100, "导入完成");
    Ok(projects)
}

fn project_record_for_import(
    request: &RemoteProjectImportRequest,
    project_id: &str,
    repo_name: &str,
    inspection: &RemoteProjectImportInspection,
) -> ProjectResult<ProjectRecord> {
    if inspection.status == RemoteProjectImportStatus::ManagedMissing {
        return inspection
            .existing_project
            .clone()
            .ok_or_else(|| "未找到需要恢复的项目记录".to_string());
    }
    Ok(imported_project_record(
        request,
        project_id,
        repo_name,
        &inspection.target_path,
    ))
}

fn validated_import_project_id(
    request: &RemoteProjectImportRequest,
    inspection: &RemoteProjectImportInspection,
) -> ProjectResult<String> {
    match inspection.status {
        RemoteProjectImportStatus::Ready => {
            if request.replace_project_id.is_some() {
                return Err("当前目标不需要替换已有项目记录".to_string());
            }
            Ok(request.project_id.clone())
        }
        RemoteProjectImportStatus::ManagedExisting => {
            Err("项目记录和本地目录都已存在，请直接打开已有项目".to_string())
        }
        RemoteProjectImportStatus::ManagedMissing => {
            let existing_project = inspection
                .existing_project
                .as_ref()
                .ok_or_else(|| "未找到需要重新导入的项目记录".to_string())?;
            if request.replace_project_id.as_deref() != Some(existing_project.id.as_str()) {
                return Err("项目记录存在但本地目录缺失，请确认后重新导入".to_string());
            }
            Ok(existing_project.id.clone())
        }
        RemoteProjectImportStatus::UnmanagedExisting => {
            Err("目标目录已存在但未被 Workbench 管理，请选择其他父目录".to_string())
        }
    }
}

fn parse_remote_repository_url(input: &str) -> ProjectResult<RemoteRepository> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("仓库地址不能为空".to_string());
    }
    if trimmed.contains('?') || trimmed.contains('#') {
        return Err("仓库地址不能包含查询参数或片段".to_string());
    }
    let lowered = trimmed.to_lowercase();
    if lowered.starts_with("https://") {
        return parse_https_repository(trimmed, &trimmed["https://".len()..]);
    }
    if lowered.starts_with("git@") {
        return parse_ssh_repository(&trimmed["git@".len()..]);
    }
    Err("仅支持 GitHub 或 Gitee 的 HTTPS/SSH 仓库地址".to_string())
}

fn parse_https_repository(original: &str, rest: &str) -> ProjectResult<RemoteRepository> {
    let mut parts = rest.split('/');
    let host = parts.next().unwrap_or_default().to_lowercase();
    let owner = parts.next().unwrap_or_default();
    let repo = parts.next().unwrap_or_default();
    if parts.next().is_some() || owner.is_empty() || repo.is_empty() {
        return Err("仓库地址必须是 owner/repo 格式".to_string());
    }
    validate_supported_host(&host)?;
    let repo_name = strip_git_suffix(repo)?;
    let clone_url = if original.ends_with(".git") {
        original.to_string()
    } else {
        format!("https://{host}/{owner}/{repo_name}.git")
    };
    Ok(RemoteRepository {
        clone_url,
        repo_name,
    })
}

fn parse_ssh_repository(rest: &str) -> ProjectResult<RemoteRepository> {
    let (host, path) = rest
        .split_once(':')
        .ok_or_else(|| "SSH 仓库地址必须是 git@host:owner/repo.git 格式".to_string())?;
    let host = host.to_lowercase();
    validate_supported_host(&host)?;
    let mut parts = path.split('/');
    let owner = parts.next().unwrap_or_default();
    let repo = parts.next().unwrap_or_default();
    if parts.next().is_some() || owner.is_empty() || repo.is_empty() {
        return Err("仓库地址必须是 owner/repo 格式".to_string());
    }
    let repo_name = strip_git_suffix(repo)?;
    Ok(RemoteRepository {
        clone_url: format!("git@{host}:{owner}/{repo_name}.git"),
        repo_name,
    })
}

fn validate_supported_host(host: &str) -> ProjectResult<()> {
    match host {
        "github.com" | "gitee.com" => Ok(()),
        _ => Err("仅支持 GitHub 和 Gitee 仓库".to_string()),
    }
}

fn strip_git_suffix(repo: &str) -> ProjectResult<String> {
    let repo_name = repo.trim_end_matches(".git").trim();
    if repo_name.is_empty() {
        return Err("仓库名称不能为空".to_string());
    }
    Ok(repo_name.to_string())
}

fn safe_directory_name(repo_name: &str) -> ProjectResult<String> {
    let sanitized = repo_name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim_matches([' ', '.'])
        .to_string();
    if sanitized.is_empty() {
        return Err("无法从仓库地址生成本地目录名".to_string());
    }
    Ok(sanitized)
}

fn validate_parent_directory(parent_directory: &str) -> ProjectResult<PathBuf> {
    let parent = PathBuf::from(parent_directory.trim());
    if parent.as_os_str().is_empty() {
        return Err("本地父目录不能为空".to_string());
    }
    if !parent.exists() {
        return Err("本地父目录不存在".to_string());
    }
    if !parent.is_dir() {
        return Err("本地父目录不是文件夹".to_string());
    }
    Ok(parent)
}

fn ensure_git_available() -> ProjectResult<()> {
    match Command::new("git").arg("--version").output() {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => Err(format!(
            "Git 检查失败：{}",
            String::from_utf8_lossy(&output.stderr).trim()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err("未检测到 git 命令，请安装 Git 或将 git 加入 PATH 后重试".to_string())
        }
        Err(error) => Err(error_message(error)),
    }
}

fn clone_repository(clone_url: &str, target_directory: &Path) -> ProjectResult<()> {
    let output = Command::new("git")
        .arg("clone")
        .arg("--progress")
        .arg(clone_url)
        .arg(target_directory)
        .output()
        .map_err(error_message)?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        return Err("Git clone 失败，请检查仓库地址、网络或凭据".to_string());
    }
    Err(format!("Git clone 失败：{stderr}"))
}

fn cleanup_created_target(target_directory: &Path) {
    if target_directory.exists() {
        let _ = fs::remove_dir_all(target_directory);
    }
}

fn imported_project_record(
    request: &RemoteProjectImportRequest,
    project_id: &str,
    repo_name: &str,
    target_path: &str,
) -> ProjectRecord {
    let name = if request.name.trim().is_empty() {
        repo_name.to_string()
    } else {
        request.name.trim().to_string()
    };
    ProjectRecord {
        id: project_id.to_string(),
        name,
        path: target_path.to_string(),
        note: request.note.trim().to_string(),
        tags: request
            .tags
            .iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect(),
        archived: false,
        launch_configs: vec![ProjectLaunchConfig {
            id: format!("{project_id}-default"),
            name: "默认".to_string(),
            command: String::new(),
            workdir: target_path.to_string(),
            enabled: true,
        }],
    }
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, import_id: &str, progress: u8, message: &str) {
    let _ = app.emit(
        "project-import-progress",
        ProjectImportProgress {
            import_id: import_id.to_string(),
            progress,
            message: message.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parses_supported_https_repositories() {
        let repository =
            parse_remote_repository_url("https://github.com/cuber-hyk/Workbench.git").unwrap();

        assert_eq!(repository.repo_name, "Workbench");
        assert_eq!(
            repository.clone_url,
            "https://github.com/cuber-hyk/Workbench.git"
        );
    }

    #[test]
    fn accepts_uppercase_https_hosts() {
        let repository = parse_remote_repository_url("https://GitHub.com/owner/repo").unwrap();

        assert_eq!(repository.repo_name, "repo");
        assert_eq!(repository.clone_url, "https://github.com/owner/repo.git");
    }

    #[test]
    fn parses_supported_ssh_repositories() {
        let repository = parse_remote_repository_url("git@gitee.com:owner/repo.git").unwrap();

        assert_eq!(repository.repo_name, "repo");
        assert_eq!(repository.clone_url, "git@gitee.com:owner/repo.git");
    }

    #[test]
    fn rejects_unsupported_hosts() {
        let error = parse_remote_repository_url("https://gitlab.com/owner/repo").unwrap_err();

        assert!(error.contains("仅支持 GitHub 和 Gitee"));
    }

    #[test]
    fn rejects_nested_repository_paths() {
        let error = parse_remote_repository_url("https://github.com/owner/team/repo").unwrap_err();

        assert!(error.contains("owner/repo"));
    }

    #[test]
    fn sanitizes_local_directory_name() {
        let directory_name = safe_directory_name("repo:name?").unwrap();

        assert_eq!(directory_name, "repo-name-");
    }

    #[test]
    fn validates_existing_parent_directory() {
        let dir = tempdir().unwrap();

        assert_eq!(
            validate_parent_directory(dir.path().to_str().unwrap()).unwrap(),
            dir.path()
        );
    }

    #[test]
    fn cleanup_only_removes_the_given_target() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("created-by-import");
        fs::create_dir_all(&target).unwrap();

        cleanup_created_target(&target);

        assert!(!target.exists());
        assert!(dir.path().exists());
    }

    #[test]
    fn inspects_all_record_and_directory_combinations() {
        let cases = [
            (false, false, RemoteProjectImportStatus::Ready),
            (true, true, RemoteProjectImportStatus::ManagedExisting),
            (true, false, RemoteProjectImportStatus::ManagedMissing),
            (false, true, RemoteProjectImportStatus::UnmanagedExisting),
        ];

        for (has_record, has_directory, expected_status) in cases {
            let dir = tempdir().unwrap();
            let workbench_root = dir.path().join("workbench");
            let parent = dir.path().join("projects");
            fs::create_dir_all(&parent).unwrap();
            let target = parent.join("demo");
            if has_directory {
                fs::create_dir_all(&target).unwrap();
            }
            if has_record {
                let connection = db::open_database(&workbench_root).unwrap();
                db::upsert_project(
                    &connection,
                    &ProjectRecord {
                        id: "demo".to_string(),
                        name: "Demo".to_string(),
                        path: target.to_string_lossy().to_string(),
                        note: String::new(),
                        tags: Vec::new(),
                        launch_configs: Vec::new(),
                        archived: false,
                    },
                )
                .unwrap();
            }

            let inspection =
                inspect_remote_project_import(&workbench_root, &remote_request(&parent)).unwrap();

            assert_eq!(inspection.status, expected_status);
            assert_eq!(inspection.existing_project.is_some(), has_record);
        }
    }

    #[test]
    fn requires_confirmation_to_reimport_missing_managed_project() {
        let existing_project = ProjectRecord {
            id: "existing".to_string(),
            name: "Existing".to_string(),
            path: "E:\\Projects\\demo".to_string(),
            note: String::new(),
            tags: Vec::new(),
            launch_configs: Vec::new(),
            archived: false,
        };
        let inspection = RemoteProjectImportInspection {
            status: RemoteProjectImportStatus::ManagedMissing,
            target_path: existing_project.path.clone(),
            existing_project: Some(existing_project),
        };
        let parent = PathBuf::from("E:\\Projects");
        let request = remote_request(&parent);

        let error = validated_import_project_id(&request, &inspection).unwrap_err();
        assert!(error.contains("确认后重新导入"));

        let confirmed_request = RemoteProjectImportRequest {
            project_id: "new-id".to_string(),
            replace_project_id: Some("existing".to_string()),
            ..request
        };
        assert_eq!(
            validated_import_project_id(&confirmed_request, &inspection).unwrap(),
            "existing"
        );
        assert_eq!(
            project_record_for_import(&confirmed_request, "existing", "demo", &inspection).unwrap(),
            inspection.existing_project.unwrap()
        );
    }

    fn remote_request(parent: &Path) -> RemoteProjectImportRequest {
        RemoteProjectImportRequest {
            import_id: "import-demo".to_string(),
            project_id: "demo".to_string(),
            replace_project_id: None,
            repo_url: "https://github.com/owner/demo.git".to_string(),
            parent_directory: parent.to_string_lossy().to_string(),
            name: "Demo".to_string(),
            note: String::new(),
            tags: Vec::new(),
        }
    }
}
