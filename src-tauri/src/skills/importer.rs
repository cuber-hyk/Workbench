use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tempfile::tempdir;
use walkdir::WalkDir;
use zip::ZipArchive;

use super::{
    backup_path, copy_path_to_backup, create_directory_symlink, current_settings,
    db::open_database, directories_match, error_message, remove_existing_target,
    save_global_enablement, sync_directory_auto_with, tool_targets, validate_directory_name,
    ExternalSkillCandidateGroup, ExternalSkillCandidateSource, ExternalSkillCandidateStatus,
    ExternalSkillSyncAction, ExternalSkillSyncResult, ExternalSkillSyncSelection,
    ExternalSkillSyncStatus, ImportResult, ImportStatus, SkillMetadata, SkillRecord, SkillResult,
    SyncMethod, UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME,
};

#[derive(Debug, serde::Deserialize)]
struct Frontmatter {
    name: Option<String>,
    description: Option<String>,
}

pub(super) fn parse_skill_markdown(markdown: &str, fallback: &str) -> SkillMetadata {
    let normalized = markdown.replace("\r\n", "\n");
    let frontmatter = normalized
        .strip_prefix("---\n")
        .and_then(|body| body.split_once("\n---"))
        .and_then(|(yaml, _)| serde_yaml::from_str::<Frontmatter>(yaml).ok());

    SkillMetadata {
        name: frontmatter
            .as_ref()
            .and_then(|value| value.name.clone())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| fallback.to_string()),
        description: frontmatter
            .and_then(|value| value.description)
            .unwrap_or_default(),
    }
}

pub(super) fn scan_skill_directories(root: &Path) -> SkillResult<Vec<SkillRecord>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();
    for entry in fs::read_dir(root).map_err(error_message)? {
        let entry = entry.map_err(error_message)?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_path = path.join("SKILL.md");
        if !skill_path.is_file() {
            continue;
        }

        let directory_name = entry.file_name().to_string_lossy().to_string();
        let markdown = fs::read_to_string(&skill_path).map_err(error_message)?;
        let metadata = parse_skill_markdown(&markdown, &directory_name);
        skills.push(SkillRecord {
            id: directory_name.clone(),
            directory_name,
            name: metadata.name,
            description: metadata.description,
            category_id: UNCATEGORIZED_CATEGORY_ID.to_string(),
            category: UNCATEGORIZED_CATEGORY_NAME.to_string(),
            skill_path: skill_path.to_string_lossy().to_string(),
            enabled_tools: Vec::new(),
            enabled_tool_methods: Vec::new(),
            global_tool_states: Vec::new(),
            enabled_projects: Vec::new(),
        });
    }
    skills.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(skills)
}

pub(super) fn import_skill_directory(
    source: &Path,
    target_root: &Path,
) -> SkillResult<ImportResult> {
    let directory_name = source
        .file_name()
        .ok_or_else(|| "导入来源没有目录名称".to_string())?
        .to_string_lossy()
        .to_string();

    if !source.join("SKILL.md").is_file() {
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Invalid,
            message: "目录中不存在 SKILL.md".to_string(),
        });
    }
    validate_directory_name(&directory_name)?;

    fs::create_dir_all(target_root).map_err(error_message)?;
    let target = target_root.join(&directory_name);
    if target.exists() || target.symlink_metadata().is_ok() {
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Conflict,
            message: "统一根目录中已存在同名 Skill".to_string(),
        });
    }

    let temporary = tempfile::tempdir_in(target_root).map_err(error_message)?;
    let staged = temporary.path().join(&directory_name);
    super::copy_directory(source, &staged)?;
    fs::rename(staged, &target).map_err(error_message)?;
    Ok(ImportResult {
        directory_name,
        status: ImportStatus::Imported,
        message: "导入成功".to_string(),
    })
}

pub(super) fn import_skill_directory_with_overwrite(
    source: &Path,
    target_root: &Path,
    overwrite: bool,
    workbench_root: &Path,
) -> SkillResult<ImportResult> {
    let directory_name = source
        .file_name()
        .ok_or_else(|| "导入来源没有目录名称".to_string())?
        .to_string_lossy()
        .to_string();

    if !source.join("SKILL.md").is_file() {
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Invalid,
            message: "目录中不存在 SKILL.md".to_string(),
        });
    }
    validate_directory_name(&directory_name)?;

    fs::create_dir_all(target_root).map_err(error_message)?;
    let target = target_root.join(&directory_name);
    if target.exists() || target.symlink_metadata().is_ok() {
        if !overwrite {
            return Ok(ImportResult {
                directory_name,
                status: ImportStatus::Conflict,
                message: "统一根目录中已存在同名 Skill".to_string(),
            });
        }
        let backup = super::backup_path(workbench_root, "workbench", &directory_name)?;
        super::copy_path_to_backup(&target, &backup)?;
        super::replace_directory_from(source, &target)?;
        let connection = open_database(workbench_root)?;
        connection
            .execute(
                "DELETE FROM skill_sources WHERE directory_name = ?1",
                [&directory_name],
            )
            .map_err(error_message)?;
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Imported,
            message: format!("已覆盖，旧版本已备份到 {}", backup.to_string_lossy()),
        });
    }

    import_skill_directory(source, target_root)
}

pub(super) fn skill_directory_metadata(
    source: &Path,
    fallback: &str,
) -> SkillResult<SkillMetadata> {
    let markdown = fs::read_to_string(source.join("SKILL.md")).map_err(error_message)?;
    Ok(parse_skill_markdown(&markdown, fallback))
}

pub(super) fn import_skill_directory_allow_skipped(
    source: &Path,
    target_root: &Path,
) -> SkillResult<ImportResult> {
    let directory_name = source
        .file_name()
        .ok_or_else(|| "导入来源没有目录名称".to_string())?
        .to_string_lossy()
        .to_string();

    if !source.join("SKILL.md").is_file() {
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Invalid,
            message: "目录中不存在 SKILL.md".to_string(),
        });
    }
    validate_directory_name(&directory_name)?;
    fs::create_dir_all(target_root).map_err(error_message)?;
    let target = target_root.join(&directory_name);
    if target.exists() || target.symlink_metadata().is_ok() {
        if target.is_dir() && directories_match(source, &target)? {
            return Ok(ImportResult {
                directory_name,
                status: ImportStatus::Skipped,
                message: "统一根目录中已存在相同内容".to_string(),
            });
        }
        return Ok(ImportResult {
            directory_name,
            status: ImportStatus::Conflict,
            message: "统一根目录中已存在同名 Skill".to_string(),
        });
    }

    import_skill_directory(source, target_root)
}

pub(super) fn candidate_status_for_source(
    source: &Path,
    target_root: &Path,
) -> SkillResult<ExternalSkillCandidateStatus> {
    let directory_name = source
        .file_name()
        .ok_or_else(|| "Skill 目录名称无效".to_string())?
        .to_string_lossy()
        .to_string();
    if validate_directory_name(&directory_name).is_err() {
        return Ok(ExternalSkillCandidateStatus::Invalid);
    }
    let target = target_root.join(&directory_name);
    if target.exists() || target.symlink_metadata().is_ok() {
        if target.is_dir() && directories_match(source, &target)? {
            Ok(ExternalSkillCandidateStatus::SameAsCurrent)
        } else {
            Ok(ExternalSkillCandidateStatus::Conflict)
        }
    } else {
        Ok(ExternalSkillCandidateStatus::New)
    }
}

pub(super) fn scan_one_level_skill_candidates(root: &Path) -> SkillResult<Vec<PathBuf>> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut candidates = Vec::new();
    for entry in fs::read_dir(root).map_err(error_message)? {
        let entry = entry.map_err(error_message)?;
        let path = entry.path();
        if path.is_dir() && path.join("SKILL.md").is_file() {
            candidates.push(path);
        }
    }
    candidates.sort();
    Ok(candidates)
}

pub(super) fn import_skills_from_folder_state(
    source_path: String,
    overwrite_directory_names: Option<Vec<String>>,
) -> SkillResult<Vec<ImportResult>> {
    let settings = current_settings()?;
    let source = PathBuf::from(source_path);
    let candidates = discover_skill_sources(&source)?;
    let overwrite_directory_names = overwrite_directory_names.unwrap_or_default();
    for directory_name in &overwrite_directory_names {
        validate_directory_name(directory_name)?;
    }
    let overwrite_directory_names = overwrite_directory_names
        .into_iter()
        .collect::<HashSet<_>>();
    let target_root = Path::new(&settings.skills_root);
    let workbench_root = Path::new(&settings.workbench_root);
    candidates
        .iter()
        .map(|candidate| {
            let directory_name = candidate
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();
            import_skill_directory_with_overwrite(
                candidate,
                target_root,
                overwrite_directory_names.contains(&directory_name),
                workbench_root,
            )
        })
        .collect()
}

pub(super) fn import_skills_from_zip_state(
    zip_path: String,
    overwrite_directory_names: Option<Vec<String>>,
) -> SkillResult<Vec<ImportResult>> {
    let file = fs::File::open(zip_path).map_err(error_message)?;
    let mut archive = ZipArchive::new(file).map_err(error_message)?;
    let temporary = tempdir().map_err(error_message)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(error_message)?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| "ZIP 中包含不安全路径".to_string())?;
        let destination = temporary.path().join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(error_message)?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(error_message)?;
        }
        let mut output = fs::File::create(destination).map_err(error_message)?;
        io::copy(&mut entry, &mut output).map_err(error_message)?;
    }
    import_skills_from_folder_state(
        temporary.path().to_string_lossy().to_string(),
        overwrite_directory_names,
    )
}

pub(super) fn discover_external_skills_state() -> SkillResult<Vec<ExternalSkillCandidateGroup>> {
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    discover_external_skills_in(&connection, Path::new(&settings.skills_root))
}

pub(super) fn discover_external_skills_in(
    connection: &Connection,
    skills_root: &Path,
) -> SkillResult<Vec<ExternalSkillCandidateGroup>> {
    let mut groups: HashMap<String, ExternalSkillCandidateGroup> = HashMap::new();
    let mut seen_roots = HashSet::new();
    let skills_root_key = normalized_path_key(skills_root);

    for target in tool_targets(connection)? {
        let target_root = PathBuf::from(&target.global_skills_dir);
        let target_key = normalized_path_key(&target_root);
        if target_key == skills_root_key || !seen_roots.insert(target_key) {
            continue;
        }
        let candidates = match scan_one_level_skill_candidates(&target_root) {
            Ok(candidates) => candidates,
            Err(error) => {
                let directory_name = format!("{}-unreadable", target.key);
                groups.insert(
                    directory_name.clone(),
                    ExternalSkillCandidateGroup {
                        directory_name,
                        display_name: target.name.clone(),
                        description: "工具目录不可读".to_string(),
                        status: ExternalSkillCandidateStatus::Unreadable,
                        sources: vec![ExternalSkillCandidateSource {
                            tool: target.key,
                            tool_name: target.name,
                            path: target_root.to_string_lossy().to_string(),
                            content_hash: None,
                            readable: false,
                            message: Some(error),
                        }],
                    },
                );
                continue;
            }
        };
        for candidate in candidates {
            let directory_name = candidate
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();
            let status = candidate_status_for_source(&candidate, skills_root)?;
            let metadata =
                skill_directory_metadata(&candidate, &directory_name).unwrap_or(SkillMetadata {
                    name: directory_name.clone(),
                    description: "无法读取 Skill 元信息".to_string(),
                });
            let content_hash = directory_content_hash(&candidate).ok();
            let source = ExternalSkillCandidateSource {
                tool: target.key.clone(),
                tool_name: target.name.clone(),
                path: candidate.to_string_lossy().to_string(),
                content_hash,
                readable: status != ExternalSkillCandidateStatus::Unreadable,
                message: None,
            };
            groups
                .entry(directory_name.clone())
                .and_modify(|group| {
                    let source_conflicts = group
                        .sources
                        .iter()
                        .any(|existing| existing.content_hash != source.content_hash);
                    group.sources.push(source.clone());
                    group.status = if source_conflicts {
                        ExternalSkillCandidateStatus::Conflict
                    } else {
                        merge_candidate_status(group.status, status)
                    };
                })
                .or_insert_with(|| ExternalSkillCandidateGroup {
                    directory_name,
                    display_name: metadata.name,
                    description: metadata.description,
                    status,
                    sources: vec![source],
                });
        }
    }

    let mut groups = groups.into_values().collect::<Vec<_>>();
    groups.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
    });
    Ok(groups)
}

pub(super) fn sync_external_skills_state(
    selections: Vec<ExternalSkillSyncSelection>,
) -> SkillResult<Vec<ExternalSkillSyncResult>> {
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let skills_root = PathBuf::from(&settings.skills_root);
    let connection = open_database(&workbench_root)?;
    sync_external_skills_in(&connection, &workbench_root, &skills_root, selections)
}

pub(super) fn sync_external_skills_in(
    connection: &Connection,
    workbench_root: &Path,
    skills_root: &Path,
    selections: Vec<ExternalSkillSyncSelection>,
) -> SkillResult<Vec<ExternalSkillSyncResult>> {
    let discovered = discover_external_skills_in(connection, skills_root)?;
    let allowed = discovered
        .iter()
        .flat_map(|group| {
            group.sources.iter().map(|source| {
                (
                    normalized_path_key(Path::new(&source.path)),
                    (
                        group.directory_name.clone(),
                        group.status,
                        source.tool.clone(),
                        source.tool_name.clone(),
                    ),
                )
            })
        })
        .collect::<HashMap<_, _>>();

    Ok(selections
        .into_iter()
        .map(|selection| {
            let fallback = ExternalSkillSyncResult {
                directory_name: selection.directory_name.clone(),
                tool: selection.tool.clone(),
                tool_name: selection.tool.clone(),
                source_path: selection.source_path.clone(),
                status: ExternalSkillSyncStatus::Failed,
                sync_method: None,
                backup_path: None,
                message: String::new(),
            };
            match sync_one_external_skill(
                connection,
                workbench_root,
                skills_root,
                &allowed,
                selection,
            ) {
                Ok(result) => result,
                Err(error) => ExternalSkillSyncResult {
                    message: error,
                    ..fallback
                },
            }
        })
        .collect())
}

fn sync_one_external_skill(
    connection: &Connection,
    workbench_root: &Path,
    skills_root: &Path,
    allowed: &HashMap<String, (String, ExternalSkillCandidateStatus, String, String)>,
    selection: ExternalSkillSyncSelection,
) -> SkillResult<ExternalSkillSyncResult> {
    validate_directory_name(&selection.directory_name)?;
    let source = PathBuf::from(&selection.source_path);
    let source_key = normalized_path_key(&source);
    let Some((discovered_name, discovered_status, discovered_tool, tool_name)) =
        allowed.get(&source_key)
    else {
        return Ok(sync_result(
            &selection,
            "",
            ExternalSkillSyncStatus::Invalid,
            None,
            None,
            "同步来源不在已发现的工具目录候选中",
        ));
    };
    if discovered_name != &selection.directory_name {
        return Ok(sync_result(
            &selection,
            tool_name,
            ExternalSkillSyncStatus::Invalid,
            None,
            None,
            "同步来源与 Skill 目录名不一致",
        ));
    }
    if discovered_tool != &selection.tool {
        return Ok(sync_result(
            &selection,
            tool_name,
            ExternalSkillSyncStatus::Invalid,
            None,
            None,
            "同步来源与工具不一致",
        ));
    }
    if selection.action == ExternalSkillSyncAction::Skip {
        return Ok(sync_result(
            &selection,
            tool_name,
            ExternalSkillSyncStatus::Skipped,
            None,
            None,
            "已跳过",
        ));
    }
    if !source.join("SKILL.md").is_file() {
        return Ok(sync_result(
            &selection,
            tool_name,
            ExternalSkillSyncStatus::Invalid,
            None,
            None,
            "同步来源中不存在 SKILL.md",
        ));
    }

    let workbench_source = skills_root.join(&selection.directory_name);
    let workbench_exists = workbench_source.join("SKILL.md").is_file();
    match selection.action {
        ExternalSkillSyncAction::Sync => match discovered_status {
            ExternalSkillCandidateStatus::New => {
                if workbench_exists {
                    let source_hash = directory_content_hash(&source)?;
                    let workbench_hash = directory_content_hash(&workbench_source)?;
                    if source_hash == workbench_hash {
                        return Ok(sync_result(
                            &selection,
                            tool_name,
                            ExternalSkillSyncStatus::Skipped,
                            None,
                            None,
                            "统一根目录中已存在相同内容，本次自动跳过",
                        ));
                    }
                    return Ok(sync_result(
                        &selection,
                        tool_name,
                        ExternalSkillSyncStatus::Conflict,
                        None,
                        None,
                        "统一根目录中已存在同名不同内容 Skill，请重新扫描后选择版本来源",
                    ));
                }
                let result = import_skill_directory(&source, skills_root)?;
                if result.status != ImportStatus::Imported {
                    return Ok(sync_result(
                        &selection,
                        tool_name,
                        ExternalSkillSyncStatus::Failed,
                        None,
                        None,
                        result.message,
                    ));
                }
            }
            ExternalSkillCandidateStatus::SameAsCurrent => {
                return Ok(sync_result(
                    &selection,
                    tool_name,
                    ExternalSkillSyncStatus::Skipped,
                    None,
                    None,
                    "统一根目录中已存在相同内容，本次自动跳过",
                ));
            }
            ExternalSkillCandidateStatus::Conflict => {
                return Ok(sync_result(
                    &selection,
                    tool_name,
                    ExternalSkillSyncStatus::Conflict,
                    None,
                    None,
                    "同名内容冲突，必须选择保留 Workbench 版本或使用外部版本",
                ));
            }
            ExternalSkillCandidateStatus::Invalid | ExternalSkillCandidateStatus::Unreadable => {
                return Ok(sync_result(
                    &selection,
                    tool_name,
                    ExternalSkillSyncStatus::Invalid,
                    None,
                    None,
                    "候选不可同步",
                ));
            }
        },
        ExternalSkillSyncAction::UseWorkbench => {
            if !workbench_exists {
                return Ok(sync_result(
                    &selection,
                    tool_name,
                    ExternalSkillSyncStatus::Invalid,
                    None,
                    None,
                    "统一根目录中不存在可保留的 Workbench 版本",
                ));
            }
        }
        ExternalSkillSyncAction::UseExternal => {
            import_skill_directory_with_overwrite(&source, skills_root, true, workbench_root)?;
        }
        ExternalSkillSyncAction::Skip => unreachable!(),
    }

    if !workbench_source.join("SKILL.md").is_file() {
        return Ok(sync_result(
            &selection,
            tool_name,
            ExternalSkillSyncStatus::Invalid,
            None,
            None,
            "统一根目录中不存在同步后的 Skill",
        ));
    }

    let backup = backup_path(workbench_root, &selection.tool, &selection.directory_name)?;
    copy_path_to_backup(&source, &backup)?;
    remove_existing_target(&source)?;
    let sync_method =
        sync_directory_auto_with(&workbench_source, &source, create_directory_symlink)?;
    save_global_enablement(
        connection,
        &selection.directory_name,
        &selection.tool,
        &source,
        sync_method,
    )?;

    Ok(sync_result(
        &selection,
        tool_name,
        ExternalSkillSyncStatus::Synced,
        Some(sync_method),
        Some(backup.to_string_lossy().to_string()),
        "已导入并接管工具目录目标",
    ))
}

fn sync_result(
    selection: &ExternalSkillSyncSelection,
    tool_name: &str,
    status: ExternalSkillSyncStatus,
    sync_method: Option<SyncMethod>,
    backup_path: Option<String>,
    message: impl Into<String>,
) -> ExternalSkillSyncResult {
    ExternalSkillSyncResult {
        directory_name: selection.directory_name.clone(),
        tool: selection.tool.clone(),
        tool_name: if tool_name.is_empty() {
            selection.tool.clone()
        } else {
            tool_name.to_string()
        },
        source_path: selection.source_path.clone(),
        status,
        sync_method,
        backup_path,
        message: message.into(),
    }
}

fn normalized_path_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_lowercase()
}

fn merge_candidate_status(
    left: ExternalSkillCandidateStatus,
    right: ExternalSkillCandidateStatus,
) -> ExternalSkillCandidateStatus {
    use ExternalSkillCandidateStatus::*;
    match (left, right) {
        (Conflict, _) | (_, Conflict) => Conflict,
        (Invalid, _) | (_, Invalid) => Invalid,
        (Unreadable, _) | (_, Unreadable) => Unreadable,
        (New, _) | (_, New) => New,
        _ => SameAsCurrent,
    }
}

fn discover_skill_sources(source: &Path) -> SkillResult<Vec<PathBuf>> {
    if source.join("SKILL.md").is_file() {
        return Ok(vec![source.to_path_buf()]);
    }
    let mut candidates = Vec::new();
    for entry in WalkDir::new(source).follow_links(true) {
        let entry = entry.map_err(error_message)?;
        if entry.file_type().is_file() && entry.file_name() == "SKILL.md" {
            if let Some(parent) = entry.path().parent() {
                candidates.push(parent.to_path_buf());
            }
        }
    }
    candidates.sort();
    candidates.dedup();
    Ok(candidates)
}

pub(super) fn directory_content_hash(root: &Path) -> SkillResult<String> {
    let mut entries = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(error_message)?
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = fs::read(entry.path()).map_err(error_message)?;
        entries.push((relative, bytes));
    }
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for (relative, bytes) in entries {
        relative.hash(&mut hasher);
        bytes.hash(&mut hasher);
    }
    Ok(format!("{:016x}", hasher.finish()))
}
