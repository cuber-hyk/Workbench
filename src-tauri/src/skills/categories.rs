use rusqlite::{params, Connection};

use super::{
    category_id_for_name, db::normalize_category_name, db::open_database, default_workbench_root,
    error_message, get_skills_state, is_unique_constraint_error, validate_directory_name,
    SkillCategory, SkillResult, SkillsState, UNCATEGORIZED_CATEGORY_ID,
    UNCATEGORIZED_CATEGORY_NAME,
};

pub(super) fn list_skill_categories(connection: &Connection) -> SkillResult<Vec<SkillCategory>> {
    let mut statement = connection
        .prepare(
            "SELECT skill_categories.id,
                    skill_categories.name,
                    skill_categories.sort_order,
                    COUNT(skill_metadata.directory_name) AS skill_count
             FROM skill_categories
             LEFT JOIN skill_metadata ON skill_metadata.category_id = skill_categories.id
             GROUP BY skill_categories.id, skill_categories.name, skill_categories.sort_order
             ORDER BY skill_categories.sort_order, skill_categories.name",
        )
        .map_err(error_message)?;
    let categories = statement
        .query_map([], |row| {
            Ok(SkillCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                skill_count: row.get(3)?,
            })
        })
        .map_err(error_message)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error_message)?;
    Ok(categories)
}

pub(super) fn require_category(
    connection: &Connection,
    category_id: &str,
) -> SkillResult<SkillCategory> {
    connection
        .query_row(
            "SELECT id, name, sort_order FROM skill_categories WHERE id = ?1",
            [category_id],
            |row| {
                Ok(SkillCategory {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sort_order: row.get(2)?,
                    skill_count: 0,
                })
            },
        )
        .map_err(|_| "分类不存在".to_string())
}

pub(super) fn set_skill_category_state(
    directory_name: String,
    category_id: String,
) -> SkillResult<SkillsState> {
    validate_directory_name(&directory_name)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    require_category(&connection, &category_id)?;
    connection
        .execute(
            "INSERT INTO skill_metadata(directory_name, category_id) VALUES(?1, ?2)
             ON CONFLICT(directory_name) DO UPDATE SET category_id = excluded.category_id",
            params![directory_name, category_id],
        )
        .map_err(error_message)?;
    get_skills_state()
}

pub(super) fn create_skill_category_state(name: String) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    create_skill_category_in(&connection, &name)?;
    get_skills_state()
}

pub(super) fn rename_skill_category_state(
    category_id: String,
    name: String,
) -> SkillResult<SkillsState> {
    if category_id == UNCATEGORIZED_CATEGORY_ID {
        return Err("未分类不能重命名".to_string());
    }
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    rename_skill_category_in(&connection, &category_id, &name)?;
    get_skills_state()
}

pub(super) fn delete_skill_category_state(
    category_id: String,
    replacement_category_id: String,
) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    delete_skill_category_in(&connection, &category_id, &replacement_category_id)?;
    get_skills_state()
}

pub(super) fn merge_skill_category_state(
    source_category_id: String,
    target_category_id: String,
) -> SkillResult<SkillsState> {
    delete_skill_category_state(source_category_id, target_category_id)
}

pub(super) fn create_skill_category_in(connection: &Connection, name: &str) -> SkillResult<String> {
    let name = validate_category_name(name)?;
    let id = category_id_for_name(&name);
    connection
        .execute(
            "INSERT INTO skill_categories(id, name, sort_order)
             VALUES(?1, ?2, COALESCE((SELECT MAX(sort_order) + 1 FROM skill_categories), 0))",
            params![id, name],
        )
        .map_err(|error| {
            if is_unique_constraint_error(&error) {
                "分类名称已存在".to_string()
            } else {
                error_message(error)
            }
        })?;
    Ok(id)
}

pub(super) fn rename_skill_category_in(
    connection: &Connection,
    category_id: &str,
    name: &str,
) -> SkillResult<()> {
    if category_id == UNCATEGORIZED_CATEGORY_ID {
        return Err("未分类不能重命名".to_string());
    }
    let name = validate_category_name(name)?;
    require_category(connection, category_id)?;
    connection
        .execute(
            "UPDATE skill_categories SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![name, category_id],
        )
        .map_err(|error| {
            if is_unique_constraint_error(&error) {
                "分类名称已存在".to_string()
            } else {
                error_message(error)
            }
        })?;
    Ok(())
}

pub(super) fn delete_skill_category_in(
    connection: &Connection,
    category_id: &str,
    replacement_category_id: &str,
) -> SkillResult<()> {
    if category_id == UNCATEGORIZED_CATEGORY_ID {
        return Err("未分类不能删除".to_string());
    }
    if category_id == replacement_category_id {
        return Err("迁移目标不能是当前分类".to_string());
    }
    require_category(connection, category_id)?;
    require_category(connection, replacement_category_id)?;
    connection
        .execute(
            "UPDATE skill_metadata SET category_id = ?1 WHERE category_id = ?2",
            params![replacement_category_id, category_id],
        )
        .map_err(error_message)?;
    connection
        .execute("DELETE FROM skill_categories WHERE id = ?1", [category_id])
        .map_err(error_message)?;
    Ok(())
}

fn validate_category_name(name: &str) -> SkillResult<String> {
    let normalized = normalize_category_name(name);
    if normalized == UNCATEGORIZED_CATEGORY_NAME {
        return Err("未分类是系统分类".to_string());
    }
    Ok(normalized)
}
