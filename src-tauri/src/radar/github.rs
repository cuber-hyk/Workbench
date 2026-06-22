use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::collections::HashSet;
use std::io::ErrorKind;
use std::process::Command;

use super::db::load_radar_items;
use super::duplicates::upsert_duplicate_group;
use super::error_message;
use super::normalize::{add_source, normalize_github_url, parse_sources};
use super::types::{
    GitHubCliStatus, GitHubStar, GitHubStarsSyncResult, RadarSourceMetadata, DEFAULT_RADAR_DOMAIN,
};
use super::RadarResult;

pub(crate) fn fetch_github_stars() -> RadarResult<Vec<GitHubStar>> {
    let output = Command::new("gh")
        .args([
            "api",
            "user/starred",
            "--paginate",
            "--jq",
            ".[] | {name: .full_name, description: .description, html_url: .html_url, stars: .stargazers_count, language: .language, topics: .topics, updated_at: .updated_at}",
        ])
        .output()
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                "未检测到 gh 命令。请先安装 GitHub CLI，并运行 gh auth login 登录后重试。"
                    .to_string()
            } else {
                format!("无法运行 GitHub CLI：{error}")
            }
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detail = if stderr.is_empty() {
            "GitHub CLI 未返回详细错误".to_string()
        } else {
            stderr
        };
        return Err(format!(
            "GitHub Stars 同步失败，请运行 gh auth login 后重试：{}",
            detail
        ));
    }
    parse_github_stars(&String::from_utf8_lossy(&output.stdout))
}

pub(crate) fn detect_github_cli_status() -> RadarResult<GitHubCliStatus> {
    if Command::new("gh").arg("--version").output().is_err() {
        return Ok(GitHubCliStatus {
            status: "missing".to_string(),
            account: String::new(),
            message: "未检测到 gh 命令。请先安装 GitHub CLI，并运行 gh auth login 登录后重试。"
                .to_string(),
        });
    }

    let output = Command::new("gh")
        .args(["auth", "status"])
        .output()
        .map_err(|error| format!("无法检查 GitHub CLI 登录状态：{error}"))?;
    let auth_output = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(classify_github_cli_auth_status(
        output.status.success(),
        &auth_output,
    ))
}

pub(crate) fn classify_github_cli_auth_status(success: bool, output: &str) -> GitHubCliStatus {
    if success {
        let account = parse_github_cli_account(output);
        let message = if account.is_empty() {
            "GitHub CLI 已就绪。".to_string()
        } else {
            format!("GitHub CLI 已就绪：当前账号 {account}。")
        };
        return GitHubCliStatus {
            status: "ready".to_string(),
            account,
            message,
        };
    }

    GitHubCliStatus {
        status: "unauthenticated".to_string(),
        account: String::new(),
        message: "GitHub CLI 已安装，但尚未登录。请运行 gh auth login 后重试。".to_string(),
    }
}

fn parse_github_cli_account(output: &str) -> String {
    output
        .lines()
        .find_map(|line| line.split_once("account "))
        .and_then(|(_prefix, suffix)| suffix.split_whitespace().next())
        .map(|account| account.trim_matches(|character| character == '(' || character == ')'))
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn parse_github_stars(output: &str) -> RadarResult<Vec<GitHubStar>> {
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            serde_json::from_str::<GitHubStar>(line)
                .map_err(|error| format!("GitHub Stars 数据解析失败：{error}"))
        })
        .collect()
}

pub(crate) fn sync_github_stars_into_database(
    connection: &mut Connection,
    stars: &[GitHubStar],
) -> RadarResult<GitHubStarsSyncResult> {
    let transaction = connection.transaction().map_err(error_message)?;
    let mut added = 0;
    let mut updated = 0;
    let mut unchanged = 0;
    let active_ids: HashSet<&str> = stars.iter().map(|star| star.name.as_str()).collect();

    for star in stars {
        match sync_github_star(&transaction, star)? {
            SyncOutcome::Added => added += 1,
            SyncOutcome::Updated => updated += 1,
            SyncOutcome::Unchanged => unchanged += 1,
        }
    }

    let deactivated = deactivate_missing_github_stars(&transaction, &active_ids)?;
    transaction.commit().map_err(error_message)?;
    Ok(GitHubStarsSyncResult {
        items: load_radar_items(connection)?,
        added,
        updated,
        deactivated,
        unchanged,
    })
}

enum SyncOutcome {
    Added,
    Updated,
    Unchanged,
}

fn sync_github_star(transaction: &Transaction<'_>, star: &GitHubStar) -> RadarResult<SyncOutcome> {
    let metadata = RadarSourceMetadata {
        language: star.language.clone().unwrap_or_default(),
        topics: star.topics.clone(),
        stars: star.stars,
        repository_updated_at: star.updated_at.clone(),
    };
    let metadata_json = serde_json::to_string(&metadata).map_err(error_message)?;
    let description = star.description.clone().unwrap_or_default();
    let existing = transaction
        .query_row(
            "
            SELECT name, url, source_description, source_metadata_json, source_active
            FROM radar_items WHERE source = 'github_star' AND external_id = ?1
            ",
            params![star.name],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)? != 0,
                ))
            },
        )
        .optional()
        .map_err(error_message)?;

    if let Some((name, url, old_description, old_metadata, active)) = existing {
        if name == star.name
            && url == star.html_url
            && old_description == description
            && old_metadata == metadata_json
            && active
        {
            transaction
                .execute(
                    "UPDATE radar_items SET last_synced_at = strftime('%s','now') WHERE source = 'github_star' AND external_id = ?1",
                    params![star.name],
                )
                .map_err(error_message)?;
            return Ok(SyncOutcome::Unchanged);
        }
        transaction
            .execute(
                "
                UPDATE radar_items SET
                    name = ?2, url = ?3, source_description = ?4,
                    source_metadata_json = ?5, source_active = 1,
                    last_synced_at = strftime('%s','now'),
                    updated_at = strftime('%s','now')
                WHERE source = 'github_star' AND external_id = ?1
                ",
                params![
                    star.name,
                    star.name,
                    star.html_url,
                    description,
                    metadata_json
                ],
            )
            .map_err(error_message)?;
        return Ok(SyncOutcome::Updated);
    }

    let manual_matches = find_manual_matches_by_github_url(transaction, &star.html_url)?;
    if manual_matches.len() == 1 {
        attach_github_source_to_manual_item(
            transaction,
            &manual_matches[0],
            star,
            &description,
            &metadata_json,
        )?;
        return Ok(SyncOutcome::Updated);
    }
    if manual_matches.len() > 1 {
        upsert_duplicate_group(
            transaction,
            "github_star",
            &star.name,
            &description,
            &metadata_json,
            &manual_matches,
        )?;
        return Ok(SyncOutcome::Unchanged);
    }

    transaction
        .execute(
            "
            INSERT INTO radar_items(
                id, name, category, domain, url, source, sources_json, external_id, source_description,
                source_metadata_json, source_active, last_synced_at
            )
            VALUES(?1, ?2, '项目', ?3, ?4, 'github_star', '[\"github_star\"]', ?5, ?6, ?7, 1, strftime('%s','now'))
            ",
            params![
                format!("github-star:{}", star.name),
                star.name,
                DEFAULT_RADAR_DOMAIN,
                star.html_url,
                star.name,
                description,
                metadata_json
            ],
        )
        .map_err(error_message)?;
    Ok(SyncOutcome::Added)
}

fn find_manual_matches_by_github_url(
    transaction: &Transaction<'_>,
    github_url: &str,
) -> RadarResult<Vec<String>> {
    let normalized = normalize_github_url(github_url);
    let mut statement = transaction
        .prepare("SELECT id, url, sources_json, source FROM radar_items WHERE external_id = ''")
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(error_message)?;
    let mut matches = Vec::new();
    for row in rows {
        let (id, url, sources_json, source) = row.map_err(error_message)?;
        let sources = parse_sources(&sources_json, &source);
        if sources.contains(&"manual".to_string()) && normalize_github_url(&url) == normalized {
            matches.push(id);
        }
    }
    Ok(matches)
}

fn attach_github_source_to_manual_item(
    transaction: &Transaction<'_>,
    item_id: &str,
    star: &GitHubStar,
    description: &str,
    metadata_json: &str,
) -> RadarResult<()> {
    let sources_json: String = transaction
        .query_row(
            "SELECT sources_json FROM radar_items WHERE id = ?1",
            params![item_id],
            |row| row.get(0),
        )
        .map_err(error_message)?;
    let sources = add_source(parse_sources(&sources_json, "manual"), "github_star");
    let sources_json = serde_json::to_string(&sources).map_err(error_message)?;
    transaction
        .execute(
            "
            UPDATE radar_items SET
                source = 'github_star',
                sources_json = ?2,
                external_id = ?3,
                source_description = ?4,
                source_metadata_json = ?5,
                source_active = 1,
                last_synced_at = strftime('%s','now'),
                updated_at = strftime('%s','now')
            WHERE id = ?1
            ",
            params![item_id, sources_json, star.name, description, metadata_json],
        )
        .map_err(error_message)?;
    Ok(())
}

fn deactivate_missing_github_stars(
    transaction: &Transaction<'_>,
    active_ids: &HashSet<&str>,
) -> RadarResult<usize> {
    let mut statement = transaction
        .prepare(
            "SELECT external_id FROM radar_items WHERE source = 'github_star' AND source_active = 1",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(error_message)?;
    let mut missing = Vec::new();
    for row in rows {
        let external_id = row.map_err(error_message)?;
        if !active_ids.contains(external_id.as_str()) {
            missing.push(external_id);
        }
    }
    drop(statement);
    for external_id in &missing {
        transaction
            .execute(
                "
                UPDATE radar_items SET source_active = 0, last_synced_at = strftime('%s','now'),
                    updated_at = strftime('%s','now')
                WHERE source = 'github_star' AND external_id = ?1
                ",
                params![external_id],
            )
            .map_err(error_message)?;
    }
    Ok(missing.len())
}
