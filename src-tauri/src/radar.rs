use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

type RadarResult<T> = Result<T, String>;

const RADAR_CATEGORIES: [&str; 4] = ["项目", "资讯", "论文", "其他"];
const RADAR_SOURCES: [&str; 2] = ["manual", "github_star"];
const DEFAULT_RADAR_DOMAIN: &str = "未分类";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RadarSourceMetadata {
    pub language: String,
    pub topics: Vec<String>,
    pub stars: i64,
    pub repository_updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RadarItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub domain: String,
    pub url: String,
    pub tags: Vec<String>,
    pub note: String,
    pub favorite: bool,
    pub updated_at: String,
    pub source: String,
    pub sources: Vec<String>,
    pub external_id: String,
    pub source_description: String,
    pub source_metadata: RadarSourceMetadata,
    pub source_active: bool,
    pub last_synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RadarDuplicateGroup {
    pub id: String,
    pub source: String,
    pub external_id: String,
    pub candidate_ids: Vec<String>,
    pub candidates: Vec<RadarItem>,
    pub status: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStarsSyncResult {
    pub items: Vec<RadarItem>,
    pub added: usize,
    pub updated: usize,
    pub deactivated: usize,
    pub unchanged: usize,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
struct GitHubStar {
    name: String,
    description: Option<String>,
    html_url: String,
    #[serde(default)]
    stars: i64,
    language: Option<String>,
    #[serde(default)]
    topics: Vec<String>,
    updated_at: String,
}

#[tauri::command]
pub fn list_radar_items() -> RadarResult<Vec<RadarItem>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    load_radar_items(&connection)
}

#[tauri::command]
pub fn save_radar_item(item: RadarItem) -> RadarResult<Vec<RadarItem>> {
    validate_radar_item(&item)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    upsert_radar_item(&connection, &item)?;
    load_radar_items(&connection)
}

#[tauri::command]
pub fn delete_radar_item(id: String) -> RadarResult<Vec<RadarItem>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    connection
        .execute("DELETE FROM radar_items WHERE id = ?1", params![id])
        .map_err(error_message)?;
    load_radar_items(&connection)
}

#[tauri::command]
pub fn list_radar_duplicate_groups() -> RadarResult<Vec<RadarDuplicateGroup>> {
    let workbench_root = default_workbench_root()?;
    let connection = open_database(&workbench_root)?;
    load_open_duplicate_groups(&connection)
}

#[tauri::command]
pub fn merge_radar_duplicate_group(
    group_id: String,
    primary_item_id: String,
) -> RadarResult<Vec<RadarItem>> {
    let workbench_root = default_workbench_root()?;
    let mut connection = open_database(&workbench_root)?;
    merge_duplicate_group(&mut connection, &group_id, &primary_item_id)?;
    load_radar_items(&connection)
}

#[tauri::command]
pub async fn sync_github_stars() -> RadarResult<GitHubStarsSyncResult> {
    tauri::async_runtime::spawn_blocking(|| {
        let stars = fetch_github_stars()?;
        let workbench_root = default_workbench_root()?;
        let mut connection = open_database(&workbench_root)?;
        sync_github_stars_into_database(&mut connection, &stars)
    })
    .await
    .map_err(|error| format!("GitHub Stars 同步任务失败：{error}"))?
}

#[tauri::command]
pub fn open_radar_link(url: String) -> RadarResult<()> {
    validate_url(&url)?;
    open_url(&url)
}

fn default_workbench_root() -> RadarResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".workbench"))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}

fn open_database(workbench_root: &Path) -> RadarResult<Connection> {
    fs::create_dir_all(workbench_root).map_err(error_message)?;
    let connection =
        Connection::open(workbench_root.join("workbench.sqlite")).map_err(error_message)?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS radar_items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                url TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                note TEXT NOT NULL DEFAULT '',
                favorite INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            ",
        )
        .map_err(error_message)?;
    ensure_radar_columns(&connection)?;
    connection
        .execute_batch(
            "
            CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_source_external_id
            ON radar_items(source, external_id)
            WHERE external_id <> '';
            CREATE TABLE IF NOT EXISTS radar_duplicate_groups (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                external_id TEXT NOT NULL,
                source_description TEXT NOT NULL DEFAULT '',
                source_metadata_json TEXT NOT NULL DEFAULT '{}',
                candidate_ids_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'open',
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_open_duplicate_group
            ON radar_duplicate_groups(source, external_id, status)
            WHERE status = 'open';
            ",
        )
        .map_err(error_message)?;
    ensure_radar_duplicate_group_columns(&connection)?;
    Ok(connection)
}

fn ensure_radar_columns(connection: &Connection) -> RadarResult<()> {
    let mut statement = connection
        .prepare("PRAGMA table_info(radar_items)")
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(error_message)?;
    let mut columns = HashSet::new();
    for row in rows {
        columns.insert(row.map_err(error_message)?);
    }

    let additions = [
        ("source", "TEXT NOT NULL DEFAULT 'manual'"),
        ("sources_json", "TEXT NOT NULL DEFAULT '[\"manual\"]'"),
        ("domain", "TEXT NOT NULL DEFAULT '未分类'"),
        ("external_id", "TEXT NOT NULL DEFAULT ''"),
        ("source_description", "TEXT NOT NULL DEFAULT ''"),
        ("source_metadata_json", "TEXT NOT NULL DEFAULT '{}'"),
        ("source_active", "INTEGER NOT NULL DEFAULT 1"),
        ("last_synced_at", "INTEGER"),
    ];
    for (name, definition) in additions {
        if !columns.contains(name) {
            connection
                .execute(
                    &format!("ALTER TABLE radar_items ADD COLUMN {name} {definition}"),
                    [],
                )
                .map_err(error_message)?;
        }
    }
    Ok(())
}

fn load_radar_items(connection: &Connection) -> RadarResult<Vec<RadarItem>> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, category, url, tags_json, note, favorite,
                   date(updated_at, 'unixepoch', 'localtime'),
                   source, sources_json, domain, external_id, source_description, source_metadata_json,
                   source_active, coalesce(datetime(last_synced_at, 'unixepoch', 'localtime'), '')
            FROM radar_items
            ORDER BY favorite DESC, updated_at DESC, lower(name)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(4)?;
            let sources_json: String = row.get(9)?;
            let source_metadata_json: String = row.get(13)?;
            Ok(RadarItem {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                domain: row.get(10)?,
                url: row.get(3)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                note: row.get(5)?,
                favorite: row.get::<_, i64>(6)? != 0,
                updated_at: row.get(7)?,
                source: row.get(8)?,
                sources: parse_sources(&sources_json, row.get::<_, String>(8)?.as_str()),
                external_id: row.get(11)?,
                source_description: row.get(12)?,
                source_metadata: serde_json::from_str(&source_metadata_json).unwrap_or_default(),
                source_active: row.get::<_, i64>(14)? != 0,
                last_synced_at: row.get(15)?,
            })
        })
        .map_err(error_message)?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(error_message)?);
    }
    Ok(items)
}

fn upsert_radar_item(connection: &Connection, item: &RadarItem) -> RadarResult<()> {
    let existing_item = connection
        .query_row(
            "SELECT source, url FROM radar_items WHERE id = ?1",
            params![item.id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(error_message)?;
    let existing_source = existing_item.as_ref().map(|(source, _url)| source.as_str());
    let existing_url = existing_item.as_ref().map(|(_source, url)| url.as_str());
    let should_check_manual_url_duplicate = existing_source.unwrap_or("manual") == "manual"
        && existing_url
            .map(|url| normalize_resource_url(url) != normalize_resource_url(&item.url))
            .unwrap_or(true);
    if should_check_manual_url_duplicate {
        ensure_no_manual_duplicate_url(connection, item)?;
    }
    if existing_source == Some("github_star") {
        let tags_json = serde_json::to_string(&item.tags).map_err(error_message)?;
        let sources_json = serde_json::to_string(&normalize_sources(&item.sources, &item.source))
            .map_err(error_message)?;
        connection
            .execute(
                "
                UPDATE radar_items
                SET category = ?2, domain = ?3, tags_json = ?4, note = ?5, favorite = ?6,
                    sources_json = ?7,
                    updated_at = strftime('%s','now')
                WHERE id = ?1
                ",
                params![
                    item.id,
                    item.category,
                    item.domain,
                    tags_json,
                    item.note,
                    if item.favorite { 1_i64 } else { 0_i64 },
                    sources_json
                ],
            )
            .map_err(error_message)?;
        return Ok(());
    }

    let tags_json = serde_json::to_string(&item.tags).map_err(error_message)?;
    let sources_json = serde_json::to_string(&normalize_sources(&item.sources, "manual"))
        .map_err(error_message)?;
    connection
        .execute(
            "
            INSERT INTO radar_items(id, name, category, domain, url, tags_json, note, favorite, source, sources_json)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'manual', ?9)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                category = excluded.category,
                domain = excluded.domain,
                url = excluded.url,
                tags_json = excluded.tags_json,
                note = excluded.note,
                favorite = excluded.favorite,
                sources_json = excluded.sources_json,
                updated_at = strftime('%s','now')
            ",
            params![
                item.id,
                item.name,
                item.category,
                item.domain,
                item.url,
                tags_json,
                item.note,
                if item.favorite { 1_i64 } else { 0_i64 },
                sources_json
            ],
        )
        .map_err(error_message)?;
    Ok(())
}

fn ensure_no_manual_duplicate_url(connection: &Connection, item: &RadarItem) -> RadarResult<()> {
    if item.url.trim().is_empty() {
        return Ok(());
    }
    let normalized_url = normalize_resource_url(&item.url);
    let mut statement = connection
        .prepare("SELECT id, name, url, source, sources_json FROM radar_items WHERE id <> ?1 AND url <> ''")
        .map_err(error_message)?;
    let rows = statement
        .query_map(params![item.id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(error_message)?;
    for row in rows {
        let (_id, name, url, source, sources_json) = row.map_err(error_message)?;
        let sources = parse_sources(&sources_json, &source);
        if sources.contains(&"manual".to_string()) && normalize_resource_url(&url) == normalized_url
        {
            return Err(format!("已存在相同链接的手动资源：{name}"));
        }
    }
    Ok(())
}

fn fetch_github_stars() -> RadarResult<Vec<GitHubStar>> {
    let output = Command::new("gh")
        .args([
            "api",
            "user/starred",
            "--paginate",
            "--jq",
            ".[] | {name: .full_name, description: .description, html_url: .html_url, stars: .stargazers_count, language: .language, topics: .topics, updated_at: .updated_at}",
        ])
        .output()
        .map_err(|error| format!("无法运行 gh CLI，请确认已安装 GitHub CLI：{error}"))?;
    if !output.status.success() {
        return Err(format!(
            "GitHub Stars 同步失败，请运行 gh auth login 后重试：{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    parse_github_stars(&String::from_utf8_lossy(&output.stdout))
}

fn parse_github_stars(output: &str) -> RadarResult<Vec<GitHubStar>> {
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            serde_json::from_str::<GitHubStar>(line)
                .map_err(|error| format!("GitHub Stars 数据解析失败：{error}"))
        })
        .collect()
}

fn sync_github_stars_into_database(
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

fn ensure_radar_duplicate_group_columns(connection: &Connection) -> RadarResult<()> {
    let mut statement = connection
        .prepare("PRAGMA table_info(radar_duplicate_groups)")
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(error_message)?;
    let mut columns = HashSet::new();
    for row in rows {
        columns.insert(row.map_err(error_message)?);
    }

    let additions = [
        ("source_description", "TEXT NOT NULL DEFAULT ''"),
        ("source_metadata_json", "TEXT NOT NULL DEFAULT '{}'"),
    ];
    for (name, definition) in additions {
        if !columns.contains(name) {
            connection
                .execute(
                    &format!("ALTER TABLE radar_duplicate_groups ADD COLUMN {name} {definition}"),
                    [],
                )
                .map_err(error_message)?;
        }
    }
    Ok(())
}

fn upsert_duplicate_group(
    transaction: &Transaction<'_>,
    source: &str,
    external_id: &str,
    source_description: &str,
    source_metadata_json: &str,
    candidate_ids: &[String],
) -> RadarResult<()> {
    let group_id = format!("{}:{}", source, external_id);
    let candidate_ids_json = serde_json::to_string(candidate_ids).map_err(error_message)?;
    let existing_group_id = transaction
        .query_row(
            "
            SELECT id FROM radar_duplicate_groups
            WHERE source = ?1 AND external_id = ?2 AND status = 'open'
            ",
            params![source, external_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(error_message)?;
    if let Some(existing_group_id) = existing_group_id {
        transaction
            .execute(
                "
                UPDATE radar_duplicate_groups
                SET source_description = ?2,
                    source_metadata_json = ?3,
                    candidate_ids_json = ?4,
                    updated_at = strftime('%s','now')
                WHERE id = ?1
                ",
                params![
                    existing_group_id,
                    source_description,
                    source_metadata_json,
                    candidate_ids_json
                ],
            )
            .map_err(error_message)?;
        return Ok(());
    }
    transaction
        .execute(
            "
            INSERT INTO radar_duplicate_groups(
                id, source, external_id, source_description, source_metadata_json,
                candidate_ids_json, status
            )
            VALUES(?1, ?2, ?3, ?4, ?5, ?6, 'open')
            ",
            params![
                group_id,
                source,
                external_id,
                source_description,
                source_metadata_json,
                candidate_ids_json
            ],
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

fn validate_radar_item(item: &RadarItem) -> RadarResult<()> {
    if item.id.trim().is_empty() {
        return Err("Radar 条目 ID 不能为空".to_string());
    }
    if item.name.trim().is_empty() {
        return Err("Radar 条目名称不能为空".to_string());
    }
    if !RADAR_CATEGORIES.contains(&item.category.as_str()) {
        return Err("Radar 条目分类无效".to_string());
    }
    if item.domain.trim().is_empty() {
        return Err("Radar 条目领域不能为空".to_string());
    }
    if !RADAR_SOURCES.contains(&item.source.as_str()) {
        return Err("Radar 条目来源无效".to_string());
    }
    if !item.url.trim().is_empty() {
        validate_url(&item.url)?;
    }
    Ok(())
}

fn load_open_duplicate_groups(connection: &Connection) -> RadarResult<Vec<RadarDuplicateGroup>> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, source, external_id, candidate_ids_json, status,
                   date(updated_at, 'unixepoch', 'localtime')
            FROM radar_duplicate_groups
            WHERE status = 'open'
            ORDER BY updated_at DESC
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let candidate_ids_json: String = row.get(3)?;
            let candidate_ids: Vec<String> =
                serde_json::from_str(&candidate_ids_json).unwrap_or_default();
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                candidate_ids,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(error_message)?;
    let items = load_radar_items(connection)?;
    let mut groups = Vec::new();
    for row in rows {
        let (id, source, external_id, candidate_ids, status, updated_at) =
            row.map_err(error_message)?;
        let candidates = candidate_ids
            .iter()
            .filter_map(|candidate_id| items.iter().find(|item| &item.id == candidate_id).cloned())
            .collect();
        groups.push(RadarDuplicateGroup {
            id,
            source,
            external_id,
            candidate_ids,
            candidates,
            status,
            updated_at,
        });
    }
    Ok(groups)
}

fn merge_duplicate_group(
    connection: &mut Connection,
    group_id: &str,
    primary_item_id: &str,
) -> RadarResult<()> {
    let transaction = connection.transaction().map_err(error_message)?;
    let (source, external_id, source_description, source_metadata_json, candidate_ids_json): (
        String,
        String,
        String,
        String,
        String,
    ) = transaction
        .query_row(
            "
            SELECT source, external_id, source_description, source_metadata_json, candidate_ids_json
            FROM radar_duplicate_groups
            WHERE id = ?1 AND status = 'open'
            ",
            params![group_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(error_message)?;
    let candidate_ids: Vec<String> =
        serde_json::from_str(&candidate_ids_json).map_err(error_message)?;
    if !candidate_ids.iter().any(|id| id == primary_item_id) {
        return Err("主资源必须来自重复候选列表".to_string());
    }

    let all_items = load_radar_items(&transaction)?;
    let candidates: Vec<RadarItem> = candidate_ids
        .iter()
        .filter_map(|id| all_items.iter().find(|item| &item.id == id).cloned())
        .collect();
    if candidates.len() != candidate_ids.len() {
        return Err("重复资源候选已不存在，请重新同步后再合并".to_string());
    }
    let primary = candidates
        .iter()
        .find(|item| item.id == primary_item_id)
        .cloned()
        .ok_or_else(|| "主资源不存在".to_string())?;
    let mut merged_tags = primary.tags.clone();
    let mut merged_sources = primary.sources.clone();
    let mut merged_note = primary.note.clone();
    let mut favorite = primary.favorite;
    for item in &candidates {
        if item.id == primary.id {
            continue;
        }
        for tag in &item.tags {
            if !merged_tags.contains(tag) {
                merged_tags.push(tag.clone());
            }
        }
        for source in &item.sources {
            if !merged_sources.contains(source) {
                merged_sources.push(source.clone());
            }
        }
        if !item.note.trim().is_empty() {
            if !merged_note.trim().is_empty() {
                merged_note.push_str("\n\n---\n\n");
            }
            merged_note.push_str(item.note.trim());
        }
        favorite = favorite || item.favorite;
    }
    merged_sources = add_source(merged_sources, &source);
    let tags_json = serde_json::to_string(&merged_tags).map_err(error_message)?;
    let sources_json = serde_json::to_string(&merged_sources).map_err(error_message)?;
    transaction
        .execute(
            "
            UPDATE radar_items SET
                tags_json = ?2, sources_json = ?3, source = ?4, external_id = ?5,
                source_description = ?6, source_metadata_json = ?7, source_active = 1,
                last_synced_at = strftime('%s','now'), favorite = ?8, note = ?9,
                updated_at = strftime('%s','now')
            WHERE id = ?1
            ",
            params![
                primary.id,
                tags_json,
                sources_json,
                source,
                external_id,
                source_description,
                source_metadata_json,
                if favorite { 1_i64 } else { 0_i64 },
                merged_note
            ],
        )
        .map_err(error_message)?;
    for item_id in candidate_ids
        .iter()
        .filter(|id| id.as_str() != primary_item_id)
    {
        transaction
            .execute("DELETE FROM radar_items WHERE id = ?1", params![item_id])
            .map_err(error_message)?;
    }
    transaction
        .execute(
            "
            UPDATE radar_duplicate_groups SET status = 'resolved',
                updated_at = strftime('%s','now')
            WHERE id = ?1
            ",
            params![group_id],
        )
        .map_err(error_message)?;
    transaction.commit().map_err(error_message)?;
    Ok(())
}

fn parse_sources(sources_json: &str, fallback: &str) -> Vec<String> {
    let parsed: Vec<String> = serde_json::from_str(sources_json).unwrap_or_default();
    normalize_sources(&parsed, fallback)
}

fn normalize_sources(sources: &[String], fallback: &str) -> Vec<String> {
    let mut normalized = Vec::new();
    for source in sources {
        if RADAR_SOURCES.contains(&source.as_str()) && !normalized.contains(source) {
            normalized.push(source.clone());
        }
    }
    if normalized.is_empty() && RADAR_SOURCES.contains(&fallback) {
        normalized.push(fallback.to_string());
    }
    normalized
}

fn add_source(mut sources: Vec<String>, source: &str) -> Vec<String> {
    if RADAR_SOURCES.contains(&source) && !sources.contains(&source.to_string()) {
        sources.push(source.to_string());
    }
    sources
}

fn normalize_github_url(url: &str) -> String {
    let trimmed = normalize_resource_url(url);
    trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("http://github.com/"))
        .map(|path| format!("https://github.com/{}", path))
        .unwrap_or(trimmed)
}

fn normalize_resource_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    trimmed.to_lowercase()
}

fn validate_url(url: &str) -> RadarResult<()> {
    let trimmed = url.trim();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        Ok(())
    } else {
        Err("链接必须使用 http:// 或 https://".to_string())
    }
}

#[cfg(windows)]
fn open_url(url: &str) -> RadarResult<()> {
    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map_err(|error| format!("打开链接失败: {error}"))?;
    Ok(())
}

#[cfg(not(windows))]
fn open_url(_url: &str) -> RadarResult<()> {
    Err("当前系统暂不支持打开链接".to_string())
}

fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_item() -> RadarItem {
        RadarItem {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            category: "项目".to_string(),
            domain: DEFAULT_RADAR_DOMAIN.to_string(),
            url: "https://example.com".to_string(),
            tags: vec!["AI".to_string(), "本地工具".to_string()],
            note: "note".to_string(),
            favorite: false,
            updated_at: String::new(),
            source: "manual".to_string(),
            sources: vec!["manual".to_string()],
            external_id: String::new(),
            source_description: String::new(),
            source_metadata: RadarSourceMetadata::default(),
            source_active: true,
            last_synced_at: String::new(),
        }
    }

    fn insert_legacy_manual_item(connection: &Connection, item: &RadarItem) {
        let tags_json = serde_json::to_string(&item.tags).unwrap();
        let sources_json = serde_json::to_string(&item.sources).unwrap();
        connection
            .execute(
                "
                INSERT INTO radar_items(
                    id, name, category, domain, url, tags_json, note, favorite,
                    source, sources_json
                )
                VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'manual', ?9)
                ",
                params![
                    item.id,
                    item.name,
                    item.category,
                    item.domain,
                    item.url,
                    tags_json,
                    item.note,
                    if item.favorite { 1_i64 } else { 0_i64 },
                    sources_json
                ],
            )
            .unwrap();
    }

    fn insert_legacy_github_item(connection: &Connection, item: &RadarItem) {
        let tags_json = serde_json::to_string(&item.tags).unwrap();
        let sources_json = serde_json::to_string(&item.sources).unwrap();
        connection
            .execute(
                "
                INSERT INTO radar_items(
                    id, name, category, domain, url, tags_json, note, favorite,
                    source, sources_json, external_id
                )
                VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'github_star', ?9, ?10)
                ",
                params![
                    item.id,
                    item.name,
                    item.category,
                    item.domain,
                    item.url,
                    tags_json,
                    item.note,
                    if item.favorite { 1_i64 } else { 0_i64 },
                    sources_json,
                    item.external_id
                ],
            )
            .unwrap();
    }

    fn sample_star() -> GitHubStar {
        GitHubStar {
            name: "owner/repo".to_string(),
            description: Some("description".to_string()),
            html_url: "https://github.com/owner/repo".to_string(),
            stars: 42,
            language: Some("Rust".to_string()),
            topics: vec!["tauri".to_string()],
            updated_at: "2026-06-15T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn upgrades_legacy_table_without_losing_items() {
        let dir = tempdir().unwrap();
        let database = dir.path().join("workbench.sqlite");
        let legacy = Connection::open(&database).unwrap();
        legacy
            .execute_batch(
                "
                CREATE TABLE radar_items (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                    url TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]',
                    note TEXT NOT NULL DEFAULT '', favorite INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
                );
                INSERT INTO radar_items(id, name, category, note) VALUES('old', 'Old', '其他', 'keep');
                ",
            )
            .unwrap();
        drop(legacy);

        let connection = open_database(dir.path()).unwrap();
        let items = load_radar_items(&connection).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].note, "keep");
        assert_eq!(items[0].source, "manual");
        assert_eq!(items[0].domain, DEFAULT_RADAR_DOMAIN);
        assert_eq!(items[0].sources, vec!["manual"]);
        assert!(items[0].source_active);
    }

    #[test]
    fn persists_updates_and_deletes_manual_radar_item() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let mut item = sample_item();

        upsert_radar_item(&connection, &item).unwrap();
        item.name = "Demo Updated".to_string();
        item.favorite = true;
        upsert_radar_item(&connection, &item).unwrap();
        let items = load_radar_items(&connection).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Demo Updated");
        assert!(items[0].favorite);
    }

    #[test]
    fn sync_is_idempotent_and_preserves_user_fields() {
        let dir = tempdir().unwrap();
        let mut connection = open_database(dir.path()).unwrap();
        let first = sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();
        assert_eq!(first.added, 1);

        let mut item = first.items[0].clone();
        item.category = "其他".to_string();
        item.tags = vec!["用户标签".to_string()];
        item.note = "用户备注".to_string();
        item.favorite = true;
        upsert_radar_item(&connection, &item).unwrap();

        let second = sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();
        assert_eq!(second.unchanged, 1);
        assert_eq!(second.items.len(), 1);
        assert_eq!(second.items[0].category, "其他");
        assert_eq!(second.items[0].tags, vec!["用户标签"]);
        assert_eq!(second.items[0].note, "用户备注");
        assert!(second.items[0].favorite);
    }

    #[test]
    fn sync_deactivates_and_reactivates_stars_without_deleting_items() {
        let dir = tempdir().unwrap();
        let mut connection = open_database(dir.path()).unwrap();
        sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();

        let removed = sync_github_stars_into_database(&mut connection, &[]).unwrap();
        assert_eq!(removed.deactivated, 1);
        assert!(!removed.items[0].source_active);

        let restored = sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();
        assert_eq!(restored.updated, 1);
        assert!(restored.items[0].source_active);
    }

    #[test]
    fn sync_attaches_github_source_to_single_matching_manual_resource() {
        let dir = tempdir().unwrap();
        let mut connection = open_database(dir.path()).unwrap();
        let mut item = sample_item();
        item.id = "manual-repo".to_string();
        item.url = "https://github.com/owner/repo".to_string();
        item.domain = "Agent".to_string();
        item.tags = vec!["用户标签".to_string()];
        item.note = "用户备注".to_string();
        upsert_radar_item(&connection, &item).unwrap();

        let result = sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();

        assert_eq!(result.added, 0);
        assert_eq!(result.updated, 1);
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].id, "manual-repo");
        assert_eq!(result.items[0].external_id, "owner/repo");
        assert_eq!(result.items[0].domain, "Agent");
        assert_eq!(result.items[0].tags, vec!["用户标签"]);
        assert_eq!(
            result.items[0].sources,
            vec!["manual".to_string(), "github_star".to_string()]
        );
    }

    #[test]
    fn sync_creates_duplicate_group_for_multiple_manual_matches() {
        let dir = tempdir().unwrap();
        let mut connection = open_database(dir.path()).unwrap();
        for id in ["manual-a", "manual-b"] {
            let mut item = sample_item();
            item.id = id.to_string();
            item.url = "https://github.com/owner/repo/".to_string();
            insert_legacy_manual_item(&connection, &item);
        }

        let result = sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();
        let groups = load_open_duplicate_groups(&connection).unwrap();

        assert_eq!(result.added, 0);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].external_id, "owner/repo");
        assert_eq!(groups[0].candidate_ids.len(), 2);
    }

    #[test]
    fn sync_does_not_merge_similar_names_with_different_urls() {
        let dir = tempdir().unwrap();
        let mut connection = open_database(dir.path()).unwrap();
        let mut item = sample_item();
        item.id = "similar".to_string();
        item.name = "owner repo guide".to_string();
        item.url = "https://example.com/owner-repo".to_string();
        upsert_radar_item(&connection, &item).unwrap();

        let result = sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();

        assert_eq!(result.added, 1);
        assert_eq!(result.items.len(), 2);
    }

    #[test]
    fn rejects_duplicate_manual_resource_url() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let mut first = sample_item();
        first.id = "first".to_string();
        first.url = "https://github.com/owner/repo".to_string();
        upsert_radar_item(&connection, &first).unwrap();

        let mut duplicate = sample_item();
        duplicate.id = "duplicate".to_string();
        duplicate.name = "Duplicate".to_string();
        duplicate.url = "https://github.com/OWNER/repo/".to_string();

        let error = upsert_radar_item(&connection, &duplicate).unwrap_err();
        assert!(error.contains("已存在相同链接的手动资源"));
    }

    #[test]
    fn updates_manual_favorite_without_rechecking_unchanged_duplicate_url() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let mut first = sample_item();
        first.id = "first".to_string();
        first.url = "https://github.com/owner/repo".to_string();
        let mut second = sample_item();
        second.id = "second".to_string();
        second.name = "Second".to_string();
        second.url = "https://github.com/owner/repo/".to_string();
        insert_legacy_manual_item(&connection, &first);
        insert_legacy_manual_item(&connection, &second);

        first.favorite = true;
        upsert_radar_item(&connection, &first).unwrap();

        let items = load_radar_items(&connection).unwrap();
        let item = items.iter().find(|item| item.id == "first").unwrap();
        assert!(item.favorite);
    }

    #[test]
    fn updates_github_star_favorite_when_same_url_manual_item_exists() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let mut manual = sample_item();
        manual.id = "manual".to_string();
        manual.url = "https://github.com/owner/repo".to_string();
        insert_legacy_manual_item(&connection, &manual);

        let mut github = sample_item();
        github.id = "github_star:owner/repo".to_string();
        github.name = "owner/repo".to_string();
        github.url = "https://github.com/owner/repo".to_string();
        github.favorite = true;
        github.source = "github_star".to_string();
        github.sources = vec!["github_star".to_string()];
        github.external_id = "owner/repo".to_string();
        insert_legacy_github_item(&connection, &github);

        github.favorite = false;
        upsert_radar_item(&connection, &github).unwrap();

        let items = load_radar_items(&connection).unwrap();
        let github_item = items
            .iter()
            .find(|item| item.id == "github_star:owner/repo")
            .unwrap();
        assert!(!github_item.favorite);
    }

    #[test]
    fn merge_duplicate_group_preserves_primary_classification_and_combines_user_fields() {
        let dir = tempdir().unwrap();
        let mut connection = open_database(dir.path()).unwrap();
        let mut primary = sample_item();
        primary.id = "primary".to_string();
        primary.url = "https://github.com/owner/repo".to_string();
        primary.domain = "Agent".to_string();
        primary.tags = vec!["A".to_string()];
        primary.note = "primary note".to_string();
        let mut secondary = sample_item();
        secondary.id = "secondary".to_string();
        secondary.url = "https://github.com/owner/repo".to_string();
        secondary.category = "论文".to_string();
        secondary.domain = "RAG".to_string();
        secondary.tags = vec!["A".to_string(), "B".to_string()];
        secondary.note = "secondary note".to_string();
        secondary.favorite = true;
        insert_legacy_manual_item(&connection, &primary);
        insert_legacy_manual_item(&connection, &secondary);
        sync_github_stars_into_database(&mut connection, &[sample_star()]).unwrap();

        merge_duplicate_group(&mut connection, "github_star:owner/repo", "primary").unwrap();
        let items = load_radar_items(&connection).unwrap();
        let groups = load_open_duplicate_groups(&connection).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "primary");
        assert_eq!(items[0].category, "项目");
        assert_eq!(items[0].domain, "Agent");
        assert_eq!(items[0].tags, vec!["A", "B"]);
        assert!(items[0].favorite);
        assert!(items[0].note.contains("primary note"));
        assert!(items[0].note.contains("secondary note"));
        assert!(items[0].sources.contains(&"github_star".to_string()));
        assert!(groups.is_empty());
    }

    #[test]
    fn rejects_invalid_category_source_url_and_github_output() {
        let mut item = sample_item();
        item.category = "模型".to_string();
        assert!(validate_radar_item(&item).is_err());

        item.category = "其他".to_string();
        item.source = "feed".to_string();
        assert!(validate_radar_item(&item).is_err());

        item.source = "manual".to_string();
        item.url = "example.com".to_string();
        assert!(validate_radar_item(&item).is_err());
        assert!(parse_github_stars("not json").is_err());
    }
}
