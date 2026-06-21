use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use super::{
    candidate_status_for_source, create_directory_symlink, current_settings, db::open_database,
    directories_match, error_message, import_skill_directory_allow_skipped, parse_sync_method,
    remove_existing_target, scan_one_level_skill_candidates, skill_directory_metadata,
    symlink_points_to, sync_directory_auto_with, sync_method_name, validate_directory_name,
    ExternalSkillCandidateStatus, ImportResult, ManagedTargetRebuildCandidate,
    ManagedTargetRebuildResult, ManagedTargetRebuildSelection, ManagedTargetRebuildStatus,
    RootSkillMigrationCandidate, RootSkillMigrationSelection, SkillMetadata, SkillResult,
    SkillsRootMigrationState, SkillsSettings, SyncMethod,
};

#[derive(Debug, Clone)]
struct ManagedTargetRecord {
    directory_name: String,
    tool: String,
    scope: String,
    project_name: String,
    project_path: String,
    link_path: String,
    sync_method: SyncMethod,
}

pub(super) fn inspect_skills_root_migration_state() -> SkillResult<SkillsRootMigrationState> {
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    inspect_skills_root_migration_in(&connection, &settings)
}

pub(super) fn inspect_skills_root_migration_in(
    connection: &Connection,
    settings: &SkillsSettings,
) -> SkillResult<SkillsRootMigrationState> {
    let current_root = PathBuf::from(&settings.skills_root);
    let previous_root = settings.previous_skills_root.as_ref().map(PathBuf::from);
    let mut candidates = Vec::new();
    if let Some(previous_root) = &previous_root {
        if previous_root != &current_root && previous_root.is_dir() {
            for source in scan_one_level_skill_candidates(previous_root)? {
                let directory_name = source
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_default();
                let status = candidate_status_for_source(&source, &current_root)?;
                let metadata =
                    skill_directory_metadata(&source, &directory_name).unwrap_or(SkillMetadata {
                        name: directory_name.clone(),
                        description: "无法读取 Skill 元信息".to_string(),
                    });
                let message = match status {
                    ExternalSkillCandidateStatus::New => "可迁移".to_string(),
                    ExternalSkillCandidateStatus::SameAsCurrent => {
                        "当前根目录已存在相同内容".to_string()
                    }
                    ExternalSkillCandidateStatus::Conflict => {
                        "当前根目录已存在同名不同内容".to_string()
                    }
                    ExternalSkillCandidateStatus::Invalid => "Skill 目录名称无效".to_string(),
                    ExternalSkillCandidateStatus::Unreadable => "Skill 目录不可读".to_string(),
                };
                candidates.push(RootSkillMigrationCandidate {
                    directory_name,
                    display_name: metadata.name,
                    description: metadata.description,
                    source_path: source.to_string_lossy().to_string(),
                    status,
                    message,
                });
            }
        }
    }
    let managed_targets = managed_target_rebuild_candidates(connection, settings)?;
    Ok(SkillsRootMigrationState {
        previous_skills_root: settings.previous_skills_root.clone(),
        current_skills_root: settings.skills_root.clone(),
        can_migrate: !candidates.is_empty(),
        candidates,
        managed_targets,
    })
}

pub(super) fn migrate_skills_root_state(
    selections: Vec<RootSkillMigrationSelection>,
) -> SkillResult<Vec<ImportResult>> {
    let settings = current_settings()?;
    let Some(previous_root) = settings.previous_skills_root.as_ref().map(PathBuf::from) else {
        return Ok(Vec::new());
    };
    let mut results = Vec::new();
    for selection in selections {
        validate_directory_name(&selection.directory_name)?;
        let source = previous_root.join(&selection.directory_name);
        results.push(import_skill_directory_allow_skipped(
            &source,
            Path::new(&settings.skills_root),
        )?);
    }
    Ok(results)
}

pub(super) fn rebuild_managed_skill_targets_state(
    selections: Vec<ManagedTargetRebuildSelection>,
) -> SkillResult<Vec<ManagedTargetRebuildResult>> {
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    selections
        .iter()
        .map(|selection| rebuild_managed_skill_target(&connection, &settings, selection))
        .collect()
}

pub(super) fn managed_target_rebuild_candidates(
    connection: &Connection,
    settings: &SkillsSettings,
) -> SkillResult<Vec<ManagedTargetRebuildCandidate>> {
    let mut statement = connection
        .prepare(
            "SELECT directory_name, tool, scope, project_name, project_path, link_path, sync_method
             FROM skill_enablements
             ORDER BY directory_name, tool, scope, project_path",
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
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(error_message)?;
    let mut candidates = Vec::new();
    for row in rows {
        let (directory_name, tool, scope, project_name, project_path, link_path, sync_method) =
            row.map_err(error_message)?;
        candidates.push(classify_managed_target_rebuild(
            settings,
            ManagedTargetRecord {
                directory_name,
                tool,
                scope,
                project_name,
                project_path,
                link_path,
                sync_method: parse_sync_method(&sync_method)?,
            },
        )?);
    }
    Ok(candidates)
}

fn classify_managed_target_rebuild(
    settings: &SkillsSettings,
    record: ManagedTargetRecord,
) -> SkillResult<ManagedTargetRebuildCandidate> {
    let ManagedTargetRecord {
        directory_name,
        tool,
        scope,
        project_name,
        project_path,
        link_path,
        sync_method,
    } = record;
    let current_source = PathBuf::from(&settings.skills_root).join(&directory_name);
    let target = PathBuf::from(&link_path);
    let Some(previous_root) = settings.previous_skills_root.as_ref().map(PathBuf::from) else {
        return Ok(ManagedTargetRebuildCandidate {
            directory_name,
            tool,
            scope,
            project_name,
            project_path,
            link_path,
            sync_method,
            status: ManagedTargetRebuildStatus::Skipped,
            message: "没有可用于重建的旧根目录记录".to_string(),
        });
    };
    let previous_source = previous_root.join(&directory_name);
    if !current_source.join("SKILL.md").is_file() {
        return Ok(ManagedTargetRebuildCandidate {
            directory_name,
            tool,
            scope,
            project_name,
            project_path,
            link_path,
            sync_method,
            status: ManagedTargetRebuildStatus::Invalid,
            message: "当前根目录中不存在该 Skill，无法重建".to_string(),
        });
    }
    let target_matches_current = match sync_method {
        SyncMethod::Symlink => symlink_points_to(&current_source, &target),
        SyncMethod::Copy => target.is_dir() && directories_match(&current_source, &target)?,
    };
    if target_matches_current {
        return Ok(ManagedTargetRebuildCandidate {
            directory_name,
            tool,
            scope,
            project_name,
            project_path,
            link_path,
            sync_method,
            status: ManagedTargetRebuildStatus::Skipped,
            message: "目标已指向当前根目录".to_string(),
        });
    }
    let target_matches_previous = match sync_method {
        SyncMethod::Symlink => symlink_points_to(&previous_source, &target),
        SyncMethod::Copy => target.is_dir() && directories_match(&previous_source, &target)?,
    };
    let status = if target.symlink_metadata().is_err() || target_matches_previous {
        ManagedTargetRebuildStatus::Ready
    } else {
        ManagedTargetRebuildStatus::Conflict
    };
    let message = match status {
        ManagedTargetRebuildStatus::Ready => "可重建到当前根目录".to_string(),
        ManagedTargetRebuildStatus::Conflict => {
            "目标已被修改或不再是旧根目录的受管内容".to_string()
        }
        _ => String::new(),
    };
    Ok(ManagedTargetRebuildCandidate {
        directory_name,
        tool,
        scope,
        project_name,
        project_path,
        link_path,
        sync_method,
        status,
        message,
    })
}

pub(super) fn rebuild_managed_skill_target(
    connection: &Connection,
    settings: &SkillsSettings,
    selection: &ManagedTargetRebuildSelection,
) -> SkillResult<ManagedTargetRebuildResult> {
    validate_directory_name(&selection.directory_name)?;
    let row = connection.query_row(
        "SELECT directory_name, tool, scope, project_name, project_path, link_path, sync_method
         FROM skill_enablements
         WHERE directory_name = ?1 AND tool = ?2 AND scope = ?3 AND project_path = ?4",
        params![
            selection.directory_name,
            selection.tool,
            selection.scope,
            selection.project_path
        ],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        },
    );
    let Ok((directory_name, tool, scope, project_name, project_path, link_path, sync_method)) = row
    else {
        return Ok(ManagedTargetRebuildResult {
            directory_name: selection.directory_name.clone(),
            tool: selection.tool.clone(),
            scope: selection.scope.clone(),
            project_path: selection.project_path.clone(),
            status: ManagedTargetRebuildStatus::Invalid,
            message: "未找到对应的 Workbench 受管启用记录".to_string(),
        });
    };
    let sync_method = parse_sync_method(&sync_method)?;
    let candidate = classify_managed_target_rebuild(
        settings,
        ManagedTargetRecord {
            directory_name: directory_name.clone(),
            tool: tool.clone(),
            scope: scope.clone(),
            project_name,
            project_path: project_path.clone(),
            link_path: link_path.clone(),
            sync_method,
        },
    )?;
    if candidate.status != ManagedTargetRebuildStatus::Ready {
        return Ok(ManagedTargetRebuildResult {
            directory_name,
            tool,
            scope,
            project_path,
            status: candidate.status,
            message: candidate.message,
        });
    }
    let source = PathBuf::from(&settings.skills_root).join(&directory_name);
    let target = PathBuf::from(&link_path);
    if target.symlink_metadata().is_ok() {
        remove_existing_target(&target)?;
    }
    let next_method = sync_directory_auto_with(&source, &target, create_directory_symlink)?;
    connection
        .execute(
            "UPDATE skill_enablements
             SET link_path = ?1, sync_method = ?2
             WHERE directory_name = ?3 AND tool = ?4 AND scope = ?5 AND project_path = ?6",
            params![
                target.to_string_lossy().to_string(),
                sync_method_name(next_method),
                directory_name,
                tool,
                scope,
                project_path
            ],
        )
        .map_err(error_message)?;
    Ok(ManagedTargetRebuildResult {
        directory_name,
        tool,
        scope,
        project_path,
        status: ManagedTargetRebuildStatus::Rebuilt,
        message: format!("已重建为 {}", sync_method_name(next_method)),
    })
}
