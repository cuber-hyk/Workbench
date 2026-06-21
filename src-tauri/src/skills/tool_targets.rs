use std::collections::HashSet;
use std::path::PathBuf;

use rusqlite::Connection;

use super::{
    db::{default_workbench_root, open_database},
    error_message, SkillResult, ToolTarget, ToolTargetSource,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct ToolTargetDefinition {
    pub(super) key: &'static str,
    pub(super) name: &'static str,
    pub(super) global_path: &'static [&'static str],
    pub(super) project_path: Option<&'static [&'static str]>,
}

pub(super) const TOOL_TARGET_ORDER_SETTING: &str = "tool_target_order";
pub(super) const TOOL_TARGET_DEFINITIONS: &[ToolTargetDefinition] = &[
    ToolTargetDefinition {
        key: "codex",
        name: "Codex",
        global_path: &[".codex", "skills"],
        project_path: Some(&[".codex", "skills"]),
    },
    ToolTargetDefinition {
        key: "claude",
        name: "Claude Code",
        global_path: &[".claude", "skills"],
        project_path: Some(&[".claude", "skills"]),
    },
    ToolTargetDefinition {
        key: "opencode",
        name: "OpenCode",
        global_path: &[".config", "opencode", "skills"],
        project_path: Some(&[".opencode", "skills"]),
    },
    ToolTargetDefinition {
        key: "deveco",
        name: "DevEco Code",
        global_path: &[".config", "deveco", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "hermes",
        name: "Hermes",
        global_path: &[".hermes", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "kimi",
        name: "Kimi Code",
        global_path: &[".kimi-code", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "pi",
        name: "Pi Agent",
        global_path: &[".pi", "agent", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "gemini",
        name: "Gemini CLI",
        global_path: &[".gemini", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "qwen",
        name: "Qwen Code",
        global_path: &[".qwen", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "goose",
        name: "Goose",
        global_path: &[".agents", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "kilo",
        name: "Kilo Code",
        global_path: &[".kilo", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "cline",
        name: "Cline",
        global_path: &[".cline", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "roo",
        name: "Roo Code",
        global_path: &[".roo", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "factory",
        name: "Factory Droid",
        global_path: &[".factory", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "amp",
        name: "Amp",
        global_path: &[".config", "agents", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "kiro",
        name: "Kiro CLI",
        global_path: &[".kiro", "skills"],
        project_path: None,
    },
    ToolTargetDefinition {
        key: "junie",
        name: "Junie CLI",
        global_path: &[".junie", "skills"],
        project_path: None,
    },
];

pub(super) fn tool_target_path(tool: &str, project_path: Option<&str>) -> SkillResult<PathBuf> {
    if let Ok(definition) = builtin_tool_target_definition(tool) {
        let base = match project_path {
            Some(path) => PathBuf::from(path),
            None => dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?,
        };
        let segments = match project_path {
            Some(_) => definition
                .project_path
                .ok_or_else(|| format!("工具不支持项目级 Skills: {}", definition.name))?,
            None => definition.global_path,
        };
        return Ok(join_path_segments(base, segments));
    }

    if project_path.is_some() {
        return Err(format!("工具不支持项目级 Skills: {tool}"));
    }
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    custom_tool_target_path(&connection, tool)
}

pub(super) fn tool_targets(connection: &Connection) -> SkillResult<Vec<ToolTarget>> {
    let mut targets = TOOL_TARGET_DEFINITIONS
        .iter()
        .map(target_definition)
        .collect::<SkillResult<Vec<_>>>()?;
    targets.extend(custom_tool_targets(connection)?);
    Ok(targets)
}

pub(super) fn ordered_tool_targets(connection: &Connection) -> SkillResult<Vec<ToolTarget>> {
    let mut targets = tool_targets(connection)?;
    let configured_order = configured_tool_target_order(connection)?;
    if configured_order.is_empty() {
        return Ok(targets);
    }
    targets.sort_by_key(|target| {
        configured_order
            .iter()
            .position(|key| key == &target.key)
            .unwrap_or(configured_order.len() + default_tool_target_index(&target.key))
    });
    Ok(targets)
}

pub(super) fn configured_tool_target_order(connection: &Connection) -> SkillResult<Vec<String>> {
    let configured = connection.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [TOOL_TARGET_ORDER_SETTING],
        |row| row.get::<_, String>(0),
    );
    match configured {
        Ok(value) => {
            let allowed = available_tool_target_keys(connection)?;
            let order: Vec<String> = serde_json::from_str(&value).map_err(error_message)?;
            Ok(order
                .into_iter()
                .filter(|key| allowed.contains(key))
                .collect())
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

fn default_tool_target_index(key: &str) -> usize {
    TOOL_TARGET_DEFINITIONS
        .iter()
        .position(|definition| definition.key == key)
        .unwrap_or(TOOL_TARGET_DEFINITIONS.len())
}

pub(super) fn builtin_tool_target_definition(
    key: &str,
) -> SkillResult<&'static ToolTargetDefinition> {
    TOOL_TARGET_DEFINITIONS
        .iter()
        .find(|definition| definition.key == key)
        .ok_or_else(|| format!("不支持的工具: {key}"))
}

pub(super) fn available_tool_target_keys(connection: &Connection) -> SkillResult<HashSet<String>> {
    Ok(tool_targets(connection)?
        .into_iter()
        .map(|target| target.key)
        .collect())
}

fn join_path_segments(mut base: PathBuf, segments: &[&str]) -> PathBuf {
    for segment in segments {
        base = base.join(segment);
    }
    base
}

fn target_definition(definition: &ToolTargetDefinition) -> SkillResult<ToolTarget> {
    let path = tool_target_path(definition.key, None)?;
    Ok(ToolTarget {
        key: definition.key.to_string(),
        name: definition.name.to_string(),
        global_skills_dir: path.to_string_lossy().to_string(),
        supports_project_scope: definition.project_path.is_some(),
        available: path.exists(),
        source: ToolTargetSource::Builtin,
        icon_path: None,
    })
}

fn custom_tool_targets(connection: &Connection) -> SkillResult<Vec<ToolTarget>> {
    let mut statement = connection
        .prepare(
            "SELECT key, name, global_skills_dir, icon_path
             FROM custom_tool_targets
             ORDER BY created_at, name",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let path = row.get::<_, String>(2)?;
            let icon_path = row.get::<_, String>(3)?;
            Ok(ToolTarget {
                key: row.get(0)?,
                name: row.get(1)?,
                available: PathBuf::from(&path).exists(),
                global_skills_dir: path,
                supports_project_scope: false,
                source: ToolTargetSource::Custom,
                icon_path: if icon_path.trim().is_empty() {
                    None
                } else {
                    Some(icon_path)
                },
            })
        })
        .map_err(error_message)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(error_message)
}

fn custom_tool_target_path(connection: &Connection, key: &str) -> SkillResult<PathBuf> {
    connection
        .query_row(
            "SELECT global_skills_dir FROM custom_tool_targets WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .map(PathBuf::from)
        .map_err(|_| format!("不支持的工具: {key}"))
}
