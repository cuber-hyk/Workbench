use std::collections::HashSet;

use regex::Regex;
use rusqlite::{params, Connection};

use super::{
    error_message, SkillMarketDetail, SkillMarketItem, SkillResult, SkillSourceRecord,
    SkillUpdateState,
};

pub(super) fn http_get_text(url: &str) -> SkillResult<String> {
    ureq::get(url)
        .set("User-Agent", "Workbench-App/0.1")
        .call()
        .map_err(|error| format!("请求远程来源失败: {error}"))?
        .into_string()
        .map_err(error_message)
}

fn decode_next_payload(html: &str) -> String {
    html.replace("\\\"", "\"")
        .replace("\\n", "\n")
        .replace("\\u0026", "&")
        .replace("\\u003c", "<")
        .replace("\\u003e", ">")
}

pub(super) fn parse_market_items(html: &str) -> SkillResult<Vec<SkillMarketItem>> {
    let decoded = decode_next_payload(html);
    let pattern = Regex::new(
        r#"\{"source":"([^"]+)","skillId":"([^"]+)","name":"([^"]+)","installs":([0-9]+)(?:,"weeklyInstalls":\[[^\]]*\])?(?:,"isOfficial":(true|false))?"#,
    )
    .map_err(error_message)?;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for captures in pattern.captures_iter(&decoded) {
        let source = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let skill_id = captures
            .get(2)
            .map(|value| value.as_str())
            .unwrap_or_default();
        if !seen.insert(format!("{source}/{skill_id}")) {
            continue;
        }
        let installs = captures
            .get(4)
            .and_then(|value| value.as_str().parse::<i64>().ok())
            .unwrap_or(0);
        let official = captures
            .get(5)
            .map(|value| value.as_str() == "true")
            .unwrap_or(false);
        items.push(SkillMarketItem {
            source: source.to_string(),
            skill_id: skill_id.to_string(),
            name: captures
                .get(3)
                .map(|value| value.as_str().to_string())
                .unwrap_or_else(|| skill_id.to_string()),
            description: String::new(),
            installs,
            official,
            installed_directory_name: None,
            update_status: SkillUpdateState::NotInstalled,
            installable: github_source(source),
        });
    }
    if items.is_empty() {
        return Err("无法从 skills.sh 页面解析市场列表".to_string());
    }
    Ok(items)
}

pub(super) fn parse_skill_detail(source: &str, skill_id: &str, html: &str) -> SkillMarketDetail {
    let decoded = decode_next_payload(html);
    let description = capture_first(
        &decoded,
        r#""@type":"SoftwareApplication","name":"[^"]+","description":"([^"]*)""#,
    )
    .or_else(|| capture_first(&decoded, r#""description","content":"([^"]*)""#))
    .unwrap_or_default();
    let installs = capture_first(&decoded, r#""userInteractionCount":([0-9]+)"#)
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let preview = capture_first(&decoded, r#""previewHtml":"(.*?)","restHtml""#)
        .map(|value| strip_html(&value))
        .unwrap_or_default();
    let item = SkillMarketItem {
        source: source.to_string(),
        skill_id: skill_id.to_string(),
        name: skill_id.to_string(),
        description,
        installs,
        official: decoded.contains("Verified organization on GitHub"),
        installed_directory_name: None,
        update_status: SkillUpdateState::NotInstalled,
        installable: github_source(source),
    };
    SkillMarketDetail {
        item,
        repository_url: github_repository_url(source).unwrap_or_default(),
        install_command: format!(
            "npx -y skills add {source} --skill {skill_id} -g --agent codex -y --copy"
        ),
        skill_markdown_preview: preview,
        security_note: "Workbench 调用 skills.sh 官方安装器完成获取和展开，再复制到统一 Skills 根目录；第三方 Skill 仍需自行确认来源可信。".to_string(),
    }
}

fn capture_first(input: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()?
        .captures(input)?
        .get(1)
        .map(|value| value.as_str().replace("\\\"", "\""))
}

pub(super) fn strip_html(value: &str) -> String {
    let decoded = value
        .replace("\\n", "\n")
        .replace("\\\"", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    let without_html = Regex::new(r"<[^>]+>")
        .map(|pattern| pattern.replace_all(&decoded, "").to_string())
        .unwrap_or(decoded);
    without_html
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !(trimmed.starts_with('$')
                && trimmed.len() > 1
                && trimmed[1..]
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric()))
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub(super) fn github_source(source: &str) -> bool {
    let parts: Vec<_> = source.split('/').collect();
    parts.len() == 2
        && parts
            .iter()
            .all(|part| !part.is_empty() && !part.contains('.') && !part.contains('\\'))
}

pub(super) fn github_repository_url(source: &str) -> Option<String> {
    github_source(source).then(|| format!("https://github.com/{source}"))
}

pub(super) fn enrich_market_items(
    connection: &Connection,
    items: &mut [SkillMarketItem],
) -> SkillResult<()> {
    let sources = list_skill_source_records(connection)?;
    for item in items {
        if let Some(source) = sources
            .iter()
            .find(|source| source.package_slug == format!("{}/{}", item.source, item.skill_id))
        {
            item.installed_directory_name = Some(source.directory_name.clone());
            item.update_status = SkillUpdateState::Installed;
        }
    }
    Ok(())
}

pub(super) fn list_skill_source_records(
    connection: &Connection,
) -> SkillResult<Vec<SkillSourceRecord>> {
    let mut statement = connection
        .prepare(
            "SELECT directory_name, source, package_slug, repo_url, skill_path, installed_ref,
                    installed_hash, remote_ref, last_checked_at, installed_at, updated_at
             FROM skill_sources
             ORDER BY directory_name",
        )
        .map_err(error_message)?;
    let records = statement
        .query_map([], |row| {
            Ok(SkillSourceRecord {
                directory_name: row.get(0)?,
                source: row.get(1)?,
                package_slug: row.get(2)?,
                repo_url: row.get(3)?,
                skill_path: row.get(4)?,
                installed_ref: row.get(5)?,
                installed_hash: row.get(6)?,
                remote_ref: row.get(7)?,
                last_checked_at: row.get(8)?,
                installed_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(error_message)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error_message)?;
    Ok(records)
}

pub(super) fn upsert_skill_source_record(
    connection: &Connection,
    record: &SkillSourceRecord,
) -> SkillResult<()> {
    connection
        .execute(
            "INSERT INTO skill_sources(
                directory_name, source, package_slug, repo_url, skill_path, installed_ref,
                installed_hash, remote_ref, last_checked_at, installed_at, updated_at
             )
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(directory_name) DO UPDATE SET
                source = excluded.source,
                package_slug = excluded.package_slug,
                repo_url = excluded.repo_url,
                skill_path = excluded.skill_path,
                installed_ref = excluded.installed_ref,
                installed_hash = excluded.installed_hash,
                remote_ref = excluded.remote_ref,
                last_checked_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP",
            params![
                record.directory_name,
                record.source,
                record.package_slug,
                record.repo_url,
                record.skill_path,
                record.installed_ref,
                record.installed_hash,
                record.remote_ref
            ],
        )
        .map_err(error_message)?;
    Ok(())
}

pub(super) fn source_record_for_directory(
    connection: &Connection,
    directory_name: &str,
) -> SkillResult<SkillSourceRecord> {
    connection
        .query_row(
            "SELECT directory_name, source, package_slug, repo_url, skill_path, installed_ref,
                    installed_hash, remote_ref, last_checked_at, installed_at, updated_at
             FROM skill_sources WHERE directory_name = ?1",
            [directory_name],
            |row| {
                Ok(SkillSourceRecord {
                    directory_name: row.get(0)?,
                    source: row.get(1)?,
                    package_slug: row.get(2)?,
                    repo_url: row.get(3)?,
                    skill_path: row.get(4)?,
                    installed_ref: row.get(5)?,
                    installed_hash: row.get(6)?,
                    remote_ref: row.get(7)?,
                    last_checked_at: row.get(8)?,
                    installed_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
        .map_err(error_message)
}
