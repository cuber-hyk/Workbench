use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::{error_message, GlobalStatus, SkillResult, SyncMethod};

pub(super) fn copy_directory(source: &Path, target: &Path) -> SkillResult<()> {
    for entry in WalkDir::new(source).follow_links(true) {
        let entry = entry.map_err(error_message)?;
        let path = entry.path();
        let relative = path.strip_prefix(source).map_err(error_message)?;
        if relative.components().any(|part| part.as_os_str() == ".git") {
            continue;
        }
        let destination = target.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination).map_err(error_message)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(error_message)?;
            }
            fs::copy(path, destination).map_err(error_message)?;
        }
    }
    Ok(())
}

pub(super) fn directories_match(left: &Path, right: &Path) -> SkillResult<bool> {
    let collect = |root: &Path| -> SkillResult<Vec<(PathBuf, Vec<u8>)>> {
        let mut files = Vec::new();
        for entry in WalkDir::new(root).follow_links(true) {
            let entry = entry.map_err(error_message)?;
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry.path().strip_prefix(root).map_err(error_message)?;
            if relative.components().any(|part| part.as_os_str() == ".git") {
                continue;
            }
            files.push((
                relative.to_path_buf(),
                fs::read(entry.path()).map_err(error_message)?,
            ));
        }
        files.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(files)
    };
    Ok(collect(left)? == collect(right)?)
}

pub(super) fn detect_external_status(source: &Path, target: &Path) -> SkillResult<GlobalStatus> {
    let Ok(metadata) = target.symlink_metadata() else {
        return Ok(GlobalStatus::Disabled);
    };
    if metadata.file_type().is_symlink() {
        return Ok(if symlink_points_to(source, target) {
            GlobalStatus::External
        } else {
            GlobalStatus::Conflict
        });
    }
    if target.is_dir() && directories_match(source, target)? {
        return Ok(GlobalStatus::External);
    }
    Ok(GlobalStatus::Conflict)
}

#[cfg(unix)]
pub(super) fn create_directory_symlink(source: &Path, target: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}

#[cfg(windows)]
pub(super) fn create_directory_symlink(source: &Path, target: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_dir(source, target)
}

pub(super) fn symlink_points_to(source: &Path, target: &Path) -> bool {
    let Ok(metadata) = target.symlink_metadata() else {
        return false;
    };
    if !metadata.file_type().is_symlink() {
        return false;
    }
    let Ok(link_target) = fs::read_link(target) else {
        return false;
    };
    let resolved = if link_target.is_absolute() {
        link_target
    } else {
        target
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .join(link_target)
    };
    resolved.canonicalize().ok() == source.canonicalize().ok()
}

pub(super) fn remove_managed_symlink(source: &Path, target: &Path) -> SkillResult<()> {
    if !symlink_points_to(source, target) {
        return Err("目标不是由 Workbench 管理的符号链接".to_string());
    }
    #[cfg(windows)]
    fs::remove_dir(target).map_err(error_message)?;
    #[cfg(unix)]
    fs::remove_file(target).map_err(error_message)?;
    Ok(())
}

pub(super) fn sync_directory_auto_with<F>(
    source: &Path,
    target: &Path,
    create_symlink: F,
) -> SkillResult<SyncMethod>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    match create_symlink(source, target) {
        Ok(()) => Ok(SyncMethod::Symlink),
        Err(_) => {
            copy_to_new_target(source, target)?;
            Ok(SyncMethod::Copy)
        }
    }
}

pub(super) fn copy_to_new_target(source: &Path, target: &Path) -> SkillResult<()> {
    let parent = target
        .parent()
        .ok_or_else(|| "同步目标路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(error_message)?;
    let temporary = tempfile::tempdir_in(parent).map_err(error_message)?;
    let staged = temporary.path().join("skill");
    copy_directory(source, &staged)?;
    fs::rename(staged, target).map_err(error_message)
}

pub(super) fn replace_directory_from(source: &Path, target: &Path) -> SkillResult<()> {
    let parent = target
        .parent()
        .ok_or_else(|| "替换目标路径无效".to_string())?;
    let temporary = tempfile::tempdir_in(parent).map_err(error_message)?;
    let staged = temporary.path().join("replacement");
    copy_directory(source, &staged)?;
    remove_existing_target(target)?;
    fs::rename(staged, target).map_err(error_message)
}

pub(super) fn remove_existing_target(target: &Path) -> SkillResult<()> {
    let Ok(metadata) = target.symlink_metadata() else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        #[cfg(windows)]
        fs::remove_dir(target).map_err(error_message)?;
        #[cfg(unix)]
        fs::remove_file(target).map_err(error_message)?;
    } else if metadata.is_dir() {
        fs::remove_dir_all(target).map_err(error_message)?;
    } else {
        fs::remove_file(target).map_err(error_message)?;
    }
    Ok(())
}

pub(super) fn remove_managed_target(
    source: &Path,
    target: &Path,
    method: SyncMethod,
) -> SkillResult<()> {
    match method {
        SyncMethod::Symlink => remove_managed_symlink(source, target),
        SyncMethod::Copy => {
            if target == source || target.symlink_metadata().is_err() || !target.is_dir() {
                return Err("受管 Copy 目标无效".to_string());
            }
            fs::remove_dir_all(target).map_err(error_message)
        }
    }
}

pub(super) fn managed_target_is_active(source: &Path, target: &Path, method: SyncMethod) -> bool {
    match method {
        SyncMethod::Symlink => symlink_points_to(source, target),
        SyncMethod::Copy => {
            target.is_dir()
                && target
                    .symlink_metadata()
                    .map(|metadata| !metadata.file_type().is_symlink())
                    .unwrap_or(false)
        }
    }
}
