use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use tauri_plugin_dialog::DialogExt;

use super::{
    available_tool_target_keys, builtin_tool_target_definition, configured_tool_target_order,
    tool_targets,
};
use super::{
    db::{default_workbench_root, open_database},
    error_message, get_skills_state,
    tool_targets::TOOL_TARGET_DEFINITIONS,
    tool_targets::TOOL_TARGET_ORDER_SETTING,
    CustomToolTargetInput, SkillResult, SkillsState,
};

pub(super) fn validate_custom_tool_key(key: &str) -> SkillResult<String> {
    let trimmed = key.trim();
    if trimmed.len() < 2 || trimmed.len() > 40 {
        return Err("工具 Key 长度需为 2 到 40 个字符".to_string());
    }
    if builtin_tool_target_definition(trimmed).is_ok() {
        return Err("工具 Key 已被内置工具占用".to_string());
    }
    let first = trimmed
        .chars()
        .next()
        .ok_or_else(|| "工具 Key 不能为空".to_string())?;
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err("工具 Key 必须以小写字母或数字开头".to_string());
    }
    if !trimmed.chars().all(|value| {
        value.is_ascii_lowercase() || value.is_ascii_digit() || value == '-' || value == '_'
    }) {
        return Err("工具 Key 仅支持小写字母、数字、短横线和下划线".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_custom_tool_name(name: &str) -> SkillResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("工具名称不能为空".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalized_tool_name(name: &str) -> String {
    name.trim().to_lowercase()
}

pub(super) fn validate_custom_tool_name_unique(
    connection: &Connection,
    name: &str,
    current_key: Option<&str>,
) -> SkillResult<()> {
    let normalized = normalized_tool_name(name);
    if TOOL_TARGET_DEFINITIONS
        .iter()
        .any(|definition| normalized_tool_name(definition.name) == normalized)
    {
        return Err("工具名称已存在".to_string());
    }
    let mut statement = connection
        .prepare("SELECT key, name FROM custom_tool_targets")
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(error_message)?;
    for row in rows {
        let (key, existing_name) = row.map_err(error_message)?;
        if Some(key.as_str()) != current_key && normalized_tool_name(&existing_name) == normalized {
            return Err("工具名称已存在".to_string());
        }
    }
    Ok(())
}

fn custom_tool_key_base(name: &str) -> String {
    let mut base = String::new();
    let mut previous_dash = false;
    for character in name.trim().chars() {
        if character.is_ascii_alphanumeric() {
            base.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash && !base.is_empty() {
            base.push('-');
            previous_dash = true;
        }
    }
    let trimmed = base
        .trim_matches('-')
        .chars()
        .take(32)
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if trimmed.is_empty() {
        "custom-tool".to_string()
    } else {
        trimmed
    }
}

pub(super) fn generate_custom_tool_key(connection: &Connection, name: &str) -> SkillResult<String> {
    let base = custom_tool_key_base(name);
    let existing = available_tool_target_keys(connection)?;
    if !existing.contains(&base) && validate_custom_tool_key(&base).is_ok() {
        return Ok(base);
    }
    for index in 2..=999 {
        let candidate = format!("{base}-{index}");
        if !existing.contains(&candidate) && validate_custom_tool_key(&candidate).is_ok() {
            return Ok(candidate);
        }
    }
    Err("无法生成自定义工具标识".to_string())
}

fn existing_custom_tool_key(connection: &Connection, key: &str) -> SkillResult<()> {
    connection
        .query_row(
            "SELECT key FROM custom_tool_targets WHERE key = ?1",
            [key],
            |_| Ok(()),
        )
        .map_err(|_| "自定义工具不存在".to_string())
}

fn validate_custom_tool_dir(path: &str) -> SkillResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("全局 Skills 目录不能为空".to_string());
    }
    let directory = PathBuf::from(trimmed);
    if !directory.is_absolute() {
        return Err("全局 Skills 目录必须是绝对路径".to_string());
    }
    Ok(directory.to_string_lossy().to_string())
}

fn copy_custom_tool_icon(workbench_root: &Path, key: &str, source: &str) -> SkillResult<String> {
    let source_path = PathBuf::from(source.trim());
    if !source_path.is_file() {
        return Err("图标文件不存在".to_string());
    }
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "图标文件缺少扩展名".to_string())?;
    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "ico" | "svg"
    ) {
        return Err("图标仅支持 png、jpg、webp、ico 或 svg".to_string());
    }
    let icon_dir = workbench_root.join("tool-icons");
    fs::create_dir_all(&icon_dir).map_err(error_message)?;
    let target = icon_dir.join(format!("{key}.{extension}"));
    if source_path != target {
        fs::copy(&source_path, &target).map_err(error_message)?;
    }
    Ok(target.to_string_lossy().to_string())
}

pub(super) fn pick_tool_icon_source<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> SkillResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .add_filter("Image", &["png", "jpg", "jpeg", "webp", "ico", "svg"])
        .blocking_pick_file()
        .map(|path| path.to_string()))
}

pub(super) fn save_custom_tool_target_state(
    input: CustomToolTargetInput,
) -> SkillResult<SkillsState> {
    let name = validate_custom_tool_name(&input.name)?;
    let global_skills_dir = validate_custom_tool_dir(&input.global_skills_dir)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let existing_key = input
        .key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(validate_custom_tool_key)
        .transpose()?;
    if let Some(key) = existing_key.as_deref() {
        existing_custom_tool_key(&connection, key)?;
    }
    validate_custom_tool_name_unique(&connection, &name, existing_key.as_deref())?;
    let key = match existing_key {
        Some(key) => key,
        None => generate_custom_tool_key(&connection, &name)?,
    };
    let icon_path = match input
        .icon_source_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(source) => copy_custom_tool_icon(&workbench_root, &key, source)?,
        None => input.icon_path.unwrap_or_default().trim().to_string(),
    };

    connection
        .execute(
            "INSERT INTO custom_tool_targets(key, name, global_skills_dir, icon_path)
             VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET
                name = excluded.name,
                global_skills_dir = excluded.global_skills_dir,
                icon_path = excluded.icon_path,
                updated_at = CURRENT_TIMESTAMP",
            params![key, name, global_skills_dir, icon_path],
        )
        .map_err(error_message)?;
    get_skills_state()
}

pub(super) fn delete_custom_tool_target_state(key: String) -> SkillResult<SkillsState> {
    let key = validate_custom_tool_key(&key)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let icon_path = connection
        .query_row(
            "SELECT icon_path FROM custom_tool_targets WHERE key = ?1",
            [&key],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "自定义工具不存在".to_string())?;

    connection
        .execute("DELETE FROM skill_enablements WHERE tool = ?1", [&key])
        .map_err(error_message)?;
    connection
        .execute("DELETE FROM custom_tool_targets WHERE key = ?1", [&key])
        .map_err(error_message)?;

    let order = configured_tool_target_order(&connection)?;
    let order_json = serde_json::to_string(&order).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![TOOL_TARGET_ORDER_SETTING, order_json],
        )
        .map_err(error_message)?;

    let icon = PathBuf::from(icon_path);
    let managed_icon_dir = workbench_root.join("tool-icons");
    if icon.starts_with(&managed_icon_dir) && icon.is_file() {
        let _ = fs::remove_file(icon);
    }

    get_skills_state()
}

pub(super) fn set_tool_target_order_state(tool_keys: Vec<String>) -> SkillResult<SkillsState> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    let order = normalized_tool_target_order(&connection, tool_keys)?;
    let order_json = serde_json::to_string(&order).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![TOOL_TARGET_ORDER_SETTING, order_json],
        )
        .map_err(error_message)?;
    get_skills_state()
}

pub(super) fn normalized_tool_target_order(
    connection: &Connection,
    tool_keys: Vec<String>,
) -> SkillResult<Vec<String>> {
    let targets = tool_targets(connection)?;
    let allowed: HashSet<String> = targets.iter().map(|target| target.key.clone()).collect();
    let mut seen = HashSet::new();
    let mut order = Vec::new();
    for key in tool_keys {
        if !allowed.contains(&key) {
            return Err(format!("不支持的工具: {key}"));
        }
        if seen.insert(key.clone()) {
            order.push(key);
        }
    }
    for target in targets {
        if seen.insert(target.key.clone()) {
            order.push(target.key);
        }
    }
    Ok(order)
}
