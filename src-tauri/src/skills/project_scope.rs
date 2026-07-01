use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use super::{
    backup_path, copy_path_to_backup, create_directory_symlink, current_settings,
    db::open_database, directories_match, error_message, importer::scan_skill_directories,
    managed_target_is_active, parse_sync_method, remove_existing_target, remove_managed_target,
    sync_directory_auto_with, sync_method_name, tool_target_path, validate_directory_name,
    ProjectSkillAction, ProjectSkillBatchEnableRequest, ProjectSkillOperationResult,
    ProjectSkillOperationStatus, ProjectSkillTarget, ProjectSkillTargetStatus, ProjectSkillsState,
    SkillRecord, SkillResult, SyncMethod, ToolTarget, UNCATEGORIZED_CATEGORY_ID,
    UNCATEGORIZED_CATEGORY_NAME,
};

struct ProjectEnablementRecord {
    link_path: String,
    sync_method: SyncMethod,
}

struct ProjectSkillWriteContext<'a> {
    connection: &'a Connection,
    workbench_root: &'a Path,
    source: &'a Path,
    target: &'a Path,
    directory_name: &'a str,
    tool: &'a str,
    project_name: &'a str,
    project_path: &'a str,
}

pub(super) fn inspect_project_skills_state(
    project_name: String,
    project_path: String,
) -> SkillResult<ProjectSkillsState> {
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let connection = open_database(&workbench_root)?;
    inspect_project_skills_in(
        &connection,
        &settings.tool_targets,
        Path::new(&settings.skills_root),
        &project_name,
        &project_path,
    )
}

fn inspect_project_skills_in(
    connection: &Connection,
    tool_targets: &[ToolTarget],
    skills_root: &Path,
    project_name: &str,
    project_path: &str,
) -> SkillResult<ProjectSkillsState> {
    let project_path_buf = PathBuf::from(project_path);
    let project_exists = project_path_buf.is_dir();
    let skills = super::enrich_skills(connection, scan_skill_directories(skills_root)?)?;
    let skill_directory_names = skills
        .iter()
        .map(|skill| skill.directory_name.as_str())
        .collect::<HashSet<_>>();
    let tools = project_tools(tool_targets);
    let mut targets = Vec::new();
    for skill in &skills {
        for tool in &tools {
            let target_path =
                tool_target_path(&tool.key, Some(project_path))?.join(&skill.directory_name);
            let target = classify_target(
                connection,
                skills_root,
                project_path,
                project_exists,
                skill,
                tool,
                &target_path,
            )?;
            targets.push(target);
        }
    }
    append_source_missing_targets(
        connection,
        &tools,
        project_path,
        project_exists,
        &skill_directory_names,
        &mut targets,
    )?;

    Ok(ProjectSkillsState {
        project_name: project_name.to_string(),
        project_path: project_path.to_string(),
        project_exists,
        tools,
        targets,
    })
}

fn append_source_missing_targets(
    connection: &Connection,
    tools: &[ToolTarget],
    project_path: &str,
    project_exists: bool,
    skill_directory_names: &HashSet<&str>,
    targets: &mut Vec<ProjectSkillTarget>,
) -> SkillResult<()> {
    let mut statement = connection
        .prepare(
            "SELECT directory_name, tool, link_path, sync_method FROM skill_enablements
             WHERE scope = 'project' AND project_path = ?1
             ORDER BY directory_name, tool",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([project_path], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(error_message)?;
    for row in rows {
        let (directory_name, tool_key, link_path, sync_method) = row.map_err(error_message)?;
        if skill_directory_names.contains(directory_name.as_str()) {
            continue;
        }
        let Some(tool) = tools.iter().find(|candidate| candidate.key == tool_key) else {
            continue;
        };
        targets.push(ProjectSkillTarget {
            directory_name: directory_name.clone(),
            skill_name: directory_name,
            description: "统一根目录中的源 Skill 已不存在".to_string(),
            category_id: UNCATEGORIZED_CATEGORY_ID.to_string(),
            category: UNCATEGORIZED_CATEGORY_NAME.to_string(),
            tool: tool.key.clone(),
            tool_name: tool.name.clone(),
            target_path: link_path,
            status: if project_exists {
                ProjectSkillTargetStatus::SourceMissing
            } else {
                ProjectSkillTargetStatus::ProjectMissing
            },
            sync_method: Some(parse_sync_method(&sync_method)?),
            message: "启用记录存在，但统一根目录中的源 Skill 已不存在".to_string(),
        });
    }
    Ok(())
}

fn project_tools(tool_targets: &[ToolTarget]) -> Vec<ToolTarget> {
    tool_targets
        .iter()
        .filter(|tool| tool.supports_project_scope)
        .cloned()
        .collect()
}

fn classify_target(
    connection: &Connection,
    skills_root: &Path,
    project_path: &str,
    project_exists: bool,
    skill: &SkillRecord,
    tool: &ToolTarget,
    target_path: &Path,
) -> SkillResult<ProjectSkillTarget> {
    let source = skills_root.join(&skill.directory_name);
    if !project_exists {
        return Ok(project_target(
            skill,
            tool,
            target_path,
            ProjectSkillTargetStatus::ProjectMissing,
            None,
            "项目路径不存在或不是目录",
        ));
    }
    let record =
        project_enablement_record(connection, &skill.directory_name, &tool.key, project_path)?;
    let metadata = target_path.symlink_metadata().ok();
    let Some(metadata) = metadata else {
        return Ok(match record {
            Some(record) => project_target(
                skill,
                tool,
                target_path,
                ProjectSkillTargetStatus::MissingTarget,
                Some(record.sync_method),
                "启用记录存在，但项目目标缺失",
            ),
            None => project_target(
                skill,
                tool,
                target_path,
                ProjectSkillTargetStatus::Disabled,
                None,
                "未启用",
            ),
        });
    };

    let Some(record) = record else {
        return Ok(project_target(
            skill,
            tool,
            target_path,
            ProjectSkillTargetStatus::Conflict,
            None,
            if metadata.file_type().is_symlink() {
                "项目目标是未受管符号链接"
            } else {
                "项目目标已存在但未由 Workbench 管理"
            },
        ));
    };

    if Path::new(&record.link_path) != target_path {
        return Ok(project_target(
            skill,
            tool,
            target_path,
            ProjectSkillTargetStatus::Conflict,
            Some(record.sync_method),
            "启用记录目标路径与当前工具路径不一致",
        ));
    }
    if !managed_target_is_active(&source, target_path, record.sync_method) {
        return Ok(project_target(
            skill,
            tool,
            target_path,
            ProjectSkillTargetStatus::Conflict,
            Some(record.sync_method),
            "项目目标已不是 Workbench 可确认的受管目标",
        ));
    }

    match record.sync_method {
        SyncMethod::Symlink => Ok(project_target(
            skill,
            tool,
            target_path,
            ProjectSkillTargetStatus::ManagedSymlink,
            Some(record.sync_method),
            "已通过符号链接启用",
        )),
        SyncMethod::Copy => {
            let status = if directories_match(&source, target_path)? {
                ProjectSkillTargetStatus::ManagedCopy
            } else {
                ProjectSkillTargetStatus::StaleCopy
            };
            let message = if status == ProjectSkillTargetStatus::ManagedCopy {
                "已通过 Copy 启用"
            } else {
                "Copy 副本与统一根目录内容不一致"
            };
            Ok(project_target(
                skill,
                tool,
                target_path,
                status,
                Some(record.sync_method),
                message,
            ))
        }
    }
}

fn project_target(
    skill: &SkillRecord,
    tool: &ToolTarget,
    target_path: &Path,
    status: ProjectSkillTargetStatus,
    sync_method: Option<SyncMethod>,
    message: &str,
) -> ProjectSkillTarget {
    ProjectSkillTarget {
        directory_name: skill.directory_name.clone(),
        skill_name: skill.name.clone(),
        description: skill.description.clone(),
        category_id: skill.category_id.clone(),
        category: skill.category.clone(),
        tool: tool.key.clone(),
        tool_name: tool.name.clone(),
        target_path: target_path.to_string_lossy().to_string(),
        status,
        sync_method,
        message: message.to_string(),
    }
}

fn project_enablement_record(
    connection: &Connection,
    directory_name: &str,
    tool: &str,
    project_path: &str,
) -> SkillResult<Option<ProjectEnablementRecord>> {
    let result = connection.query_row(
        "SELECT link_path, sync_method FROM skill_enablements
         WHERE directory_name = ?1 AND tool = ?2 AND scope = 'project' AND project_path = ?3",
        params![directory_name, tool, project_path],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    match result {
        Ok((link_path, sync_method)) => Ok(Some(ProjectEnablementRecord {
            link_path,
            sync_method: parse_sync_method(&sync_method)?,
        })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error_message(error)),
    }
}

pub(super) fn apply_project_skill_action_state(
    directory_name: String,
    tool: String,
    project_name: String,
    project_path: String,
    action: ProjectSkillAction,
) -> SkillResult<ProjectSkillOperationResult> {
    validate_directory_name(&directory_name)?;
    let settings = current_settings()?;
    let workbench_root = PathBuf::from(&settings.workbench_root);
    let skills_root = PathBuf::from(&settings.skills_root);
    let source = skills_root.join(&directory_name);
    if action != ProjectSkillAction::ClearRecord && !source.join("SKILL.md").is_file() {
        return Ok(operation_result(
            &directory_name,
            &tool,
            ProjectSkillOperationStatus::Failed,
            None,
            None,
            "统一根目录中不存在该 Skill",
        ));
    }
    if !Path::new(&project_path).is_dir() {
        return Ok(operation_result(
            &directory_name,
            &tool,
            ProjectSkillOperationStatus::Failed,
            None,
            None,
            "项目路径不存在或不是目录",
        ));
    }
    let target_root = tool_target_path(&tool, Some(&project_path))?;
    let target = target_root.join(&directory_name);
    let connection = open_database(&workbench_root)?;
    match action {
        ProjectSkillAction::Enable => enable_project_skill(
            &connection,
            &source,
            &target,
            &directory_name,
            &tool,
            &project_name,
            &project_path,
        ),
        ProjectSkillAction::Disable => disable_project_skill(
            &connection,
            &source,
            &target,
            &directory_name,
            &tool,
            &project_path,
        ),
        ProjectSkillAction::Rebuild => rebuild_project_skill(ProjectSkillWriteContext {
            connection: &connection,
            workbench_root: &workbench_root,
            source: &source,
            target: &target,
            directory_name: &directory_name,
            tool: &tool,
            project_name: &project_name,
            project_path: &project_path,
        }),
        ProjectSkillAction::UseWorkbench => {
            replace_conflicting_project_skill(ProjectSkillWriteContext {
                connection: &connection,
                workbench_root: &workbench_root,
                source: &source,
                target: &target,
                directory_name: &directory_name,
                tool: &tool,
                project_name: &project_name,
                project_path: &project_path,
            })
        }
        ProjectSkillAction::ClearRecord => {
            clear_missing_project_record(&connection, &directory_name, &tool, &project_path)
        }
    }
}

pub(super) fn batch_enable_project_skills_state(
    request: ProjectSkillBatchEnableRequest,
) -> SkillResult<Vec<ProjectSkillOperationResult>> {
    let mut results = Vec::new();
    for directory_name in request.directory_names {
        for tool in &request.tools {
            match apply_project_skill_action_state(
                directory_name.clone(),
                tool.clone(),
                request.project_name.clone(),
                request.project_path.clone(),
                ProjectSkillAction::Enable,
            ) {
                Ok(result) => results.push(result),
                Err(error) => results.push(operation_result(
                    &directory_name,
                    tool,
                    ProjectSkillOperationStatus::Failed,
                    None,
                    None,
                    &error,
                )),
            }
        }
    }
    Ok(results)
}

fn enable_project_skill(
    connection: &Connection,
    source: &Path,
    target: &Path,
    directory_name: &str,
    tool: &str,
    project_name: &str,
    project_path: &str,
) -> SkillResult<ProjectSkillOperationResult> {
    if target.symlink_metadata().is_ok() {
        if let Some(record) =
            project_enablement_record(connection, directory_name, tool, project_path)?
        {
            if Path::new(&record.link_path) == target
                && managed_target_is_active(source, target, record.sync_method)
            {
                return Ok(operation_result(
                    directory_name,
                    tool,
                    ProjectSkillOperationStatus::Skipped,
                    Some(record.sync_method),
                    None,
                    "已由 Workbench 管理",
                ));
            }
        }
        return Ok(operation_result(
            directory_name,
            tool,
            ProjectSkillOperationStatus::Conflict,
            None,
            None,
            "目标位置已存在，Workbench 不会自动覆盖",
        ));
    }
    let sync_method = sync_directory_auto_with(source, target, create_directory_symlink)?;
    save_project_enablement(
        connection,
        directory_name,
        tool,
        project_name,
        project_path,
        target,
        sync_method,
    )?;
    Ok(operation_result(
        directory_name,
        tool,
        ProjectSkillOperationStatus::Enabled,
        Some(sync_method),
        None,
        "已启用",
    ))
}

fn disable_project_skill(
    connection: &Connection,
    source: &Path,
    target: &Path,
    directory_name: &str,
    tool: &str,
    project_path: &str,
) -> SkillResult<ProjectSkillOperationResult> {
    let Some(record) = project_enablement_record(connection, directory_name, tool, project_path)?
    else {
        return Ok(operation_result(
            directory_name,
            tool,
            ProjectSkillOperationStatus::Skipped,
            None,
            None,
            "没有 Workbench 管理的项目级启用记录",
        ));
    };
    if Path::new(&record.link_path) != target {
        return Ok(operation_result(
            directory_name,
            tool,
            ProjectSkillOperationStatus::Conflict,
            Some(record.sync_method),
            None,
            "受管目标路径与当前工具路径不一致",
        ));
    }
    remove_managed_target(source, target, record.sync_method)?;
    delete_project_enablement(connection, directory_name, tool, project_path)?;
    Ok(operation_result(
        directory_name,
        tool,
        ProjectSkillOperationStatus::Disabled,
        Some(record.sync_method),
        None,
        "已停用",
    ))
}

fn rebuild_project_skill(
    context: ProjectSkillWriteContext<'_>,
) -> SkillResult<ProjectSkillOperationResult> {
    let Some(record) = project_enablement_record(
        context.connection,
        context.directory_name,
        context.tool,
        context.project_path,
    )?
    else {
        return Ok(operation_result(
            context.directory_name,
            context.tool,
            ProjectSkillOperationStatus::Skipped,
            None,
            None,
            "没有 Workbench 管理的项目级启用记录",
        ));
    };
    if Path::new(&record.link_path) != context.target {
        return Ok(operation_result(
            context.directory_name,
            context.tool,
            ProjectSkillOperationStatus::Conflict,
            Some(record.sync_method),
            None,
            "受管目标路径与当前工具路径不一致",
        ));
    }
    let mut backup = None;
    if context.target.symlink_metadata().is_ok() {
        if !managed_target_is_active(context.source, context.target, record.sync_method) {
            return Ok(operation_result(
                context.directory_name,
                context.tool,
                ProjectSkillOperationStatus::Conflict,
                Some(record.sync_method),
                None,
                "项目目标已不是 Workbench 可确认的受管目标",
            ));
        }
        let backup_path =
            backup_path(context.workbench_root, context.tool, context.directory_name)?;
        copy_path_to_backup(context.target, &backup_path)?;
        backup = Some(backup_path.to_string_lossy().to_string());
        remove_managed_target(context.source, context.target, record.sync_method)?;
    }
    let sync_method =
        sync_directory_auto_with(context.source, context.target, create_directory_symlink)?;
    save_project_enablement(
        context.connection,
        context.directory_name,
        context.tool,
        context.project_name,
        context.project_path,
        context.target,
        sync_method,
    )?;
    Ok(operation_result(
        context.directory_name,
        context.tool,
        ProjectSkillOperationStatus::Rebuilt,
        Some(sync_method),
        backup,
        "已重建受管目标",
    ))
}

fn replace_conflicting_project_skill(
    context: ProjectSkillWriteContext<'_>,
) -> SkillResult<ProjectSkillOperationResult> {
    let mut backup = None;
    if context.target.symlink_metadata().is_ok() {
        let backup_path =
            backup_path(context.workbench_root, context.tool, context.directory_name)?;
        copy_path_to_backup(context.target, &backup_path)?;
        backup = Some(backup_path.to_string_lossy().to_string());
        remove_existing_target(context.target)?;
    }
    let sync_method =
        sync_directory_auto_with(context.source, context.target, create_directory_symlink)?;
    save_project_enablement(
        context.connection,
        context.directory_name,
        context.tool,
        context.project_name,
        context.project_path,
        context.target,
        sync_method,
    )?;
    Ok(operation_result(
        context.directory_name,
        context.tool,
        ProjectSkillOperationStatus::Enabled,
        Some(sync_method),
        backup,
        "已使用统一根目录版本并接管",
    ))
}

fn clear_missing_project_record(
    connection: &Connection,
    directory_name: &str,
    tool: &str,
    project_path: &str,
) -> SkillResult<ProjectSkillOperationResult> {
    delete_project_enablement(connection, directory_name, tool, project_path)?;
    Ok(operation_result(
        directory_name,
        tool,
        ProjectSkillOperationStatus::Cleared,
        None,
        None,
        "已清理失效记录",
    ))
}

fn save_project_enablement(
    connection: &Connection,
    directory_name: &str,
    tool: &str,
    project_name: &str,
    project_path: &str,
    target: &Path,
    sync_method: SyncMethod,
) -> SkillResult<()> {
    connection
        .execute(
            "INSERT INTO skill_enablements(directory_name, tool, scope, project_name, project_path, link_path, sync_method)
             VALUES(?1, ?2, 'project', ?3, ?4, ?5, ?6)
             ON CONFLICT(directory_name, tool, scope, project_path)
             DO UPDATE SET project_name = excluded.project_name, link_path = excluded.link_path, sync_method = excluded.sync_method",
            params![
                directory_name,
                tool,
                project_name,
                project_path,
                target.to_string_lossy().to_string(),
                sync_method_name(sync_method)
            ],
        )
        .map_err(error_message)?;
    Ok(())
}

fn delete_project_enablement(
    connection: &Connection,
    directory_name: &str,
    tool: &str,
    project_path: &str,
) -> SkillResult<()> {
    connection
        .execute(
            "DELETE FROM skill_enablements
             WHERE directory_name = ?1 AND tool = ?2 AND scope = 'project' AND project_path = ?3",
            params![directory_name, tool, project_path],
        )
        .map_err(error_message)?;
    Ok(())
}

fn operation_result(
    directory_name: &str,
    tool: &str,
    status: ProjectSkillOperationStatus,
    sync_method: Option<SyncMethod>,
    backup_path: Option<String>,
    message: &str,
) -> ProjectSkillOperationResult {
    ProjectSkillOperationResult {
        directory_name: directory_name.to_string(),
        tool: tool.to_string(),
        status,
        sync_method,
        backup_path,
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn test_tool() -> ToolTarget {
        ToolTarget {
            key: "codex".to_string(),
            name: "Codex".to_string(),
            global_skills_dir: String::new(),
            supports_project_scope: true,
            available: true,
            source: super::super::ToolTargetSource::Builtin,
            icon_path: None,
        }
    }

    fn skill(root: &Path, name: &str, body: &str) {
        let dir = root.join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("SKILL.md"), body).unwrap();
    }

    fn connection(root: &Path) -> Connection {
        super::super::db::open_database(root).unwrap()
    }

    #[test]
    fn inspect_project_skills_reports_disabled_and_project_missing() {
        let root = tempdir().unwrap();
        let skills_root = root.path().join("skills");
        skill(&skills_root, "review", "review");
        let db_root = root.path().join("db");
        let connection = connection(&db_root);

        let missing = inspect_project_skills_in(
            &connection,
            &[test_tool()],
            &skills_root,
            "Missing",
            &root.path().join("missing").to_string_lossy(),
        )
        .unwrap();
        assert!(!missing.project_exists);
        assert_eq!(
            missing.targets[0].status,
            ProjectSkillTargetStatus::ProjectMissing
        );

        let project = root.path().join("project");
        fs::create_dir_all(&project).unwrap();
        let ready = inspect_project_skills_in(
            &connection,
            &[test_tool()],
            &skills_root,
            "Project",
            &project.to_string_lossy(),
        )
        .unwrap();
        assert!(ready.project_exists);
        assert_eq!(ready.targets[0].status, ProjectSkillTargetStatus::Disabled);
    }

    #[test]
    fn inspect_project_skills_reports_conflict_for_unmanaged_target() {
        let root = tempdir().unwrap();
        let skills_root = root.path().join("skills");
        let project = root.path().join("project");
        skill(&skills_root, "review", "review");
        fs::create_dir_all(project.join(".codex/skills/review")).unwrap();
        fs::write(project.join(".codex/skills/review/SKILL.md"), "different").unwrap();
        let db_root = root.path().join("db");
        let connection = connection(&db_root);

        let state = inspect_project_skills_in(
            &connection,
            &[test_tool()],
            &skills_root,
            "Project",
            &project.to_string_lossy(),
        )
        .unwrap();

        assert_eq!(state.targets[0].status, ProjectSkillTargetStatus::Conflict);
    }

    #[test]
    fn enable_project_skill_reports_conflict_without_overwriting_unmanaged_target() {
        let root = tempdir().unwrap();
        let skills_root = root.path().join("skills");
        let project = root.path().join("project");
        let source = skills_root.join("review");
        let target = project.join(".codex/skills/review");
        skill(&skills_root, "review", "workbench");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("SKILL.md"), "project-local").unwrap();
        let db_root = root.path().join("db");
        let connection = connection(&db_root);

        let result = enable_project_skill(
            &connection,
            &source,
            &target,
            "review",
            "codex",
            "Project",
            &project.to_string_lossy(),
        )
        .unwrap();

        assert_eq!(result.status, ProjectSkillOperationStatus::Conflict);
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "project-local"
        );
        assert!(project_enablement_record(
            &connection,
            "review",
            "codex",
            &project.to_string_lossy()
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn inspect_project_skills_reports_source_missing_records() {
        let root = tempdir().unwrap();
        let skills_root = root.path().join("skills");
        let project = root.path().join("project");
        fs::create_dir_all(&project).unwrap();
        let db_root = root.path().join("db");
        let connection = connection(&db_root);
        connection
            .execute(
                "INSERT INTO skill_enablements(directory_name, tool, scope, project_name, project_path, link_path, sync_method)
                 VALUES('deleted-skill', 'codex', 'project', 'Project', ?1, ?2, 'copy')",
                params![
                    project.to_string_lossy().to_string(),
                    project
                        .join(".codex/skills/deleted-skill")
                        .to_string_lossy()
                        .to_string()
                ],
            )
            .unwrap();

        let state = inspect_project_skills_in(
            &connection,
            &[test_tool()],
            &skills_root,
            "Project",
            &project.to_string_lossy(),
        )
        .unwrap();

        assert_eq!(state.targets[0].directory_name, "deleted-skill");
        assert_eq!(
            state.targets[0].status,
            ProjectSkillTargetStatus::SourceMissing
        );
    }
}
