use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

type RadarResult<T> = Result<T, String>;

const RADAR_CATEGORIES: [&str; 4] = ["项目", "资讯", "论文", "其他"];
const RADAR_SOURCES: [&str; 2] = ["manual", "github_star"];

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
    pub url: String,
    pub tags: Vec<String>,
    pub note: String,
    pub favorite: bool,
    pub updated_at: String,
    pub source: String,
    pub external_id: String,
    pub source_description: String,
    pub source_metadata: RadarSourceMetadata,
    pub source_active: bool,
    pub last_synced_at: String,
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
            ",
        )
        .map_err(error_message)?;
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
                   source, external_id, source_description, source_metadata_json,
                   source_active, coalesce(datetime(last_synced_at, 'unixepoch', 'localtime'), '')
            FROM radar_items
            ORDER BY favorite DESC, updated_at DESC, lower(name)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(4)?;
            let source_metadata_json: String = row.get(11)?;
            Ok(RadarItem {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                url: row.get(3)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                note: row.get(5)?,
                favorite: row.get::<_, i64>(6)? != 0,
                updated_at: row.get(7)?,
                source: row.get(8)?,
                external_id: row.get(9)?,
                source_description: row.get(10)?,
                source_metadata: serde_json::from_str(&source_metadata_json).unwrap_or_default(),
                source_active: row.get::<_, i64>(12)? != 0,
                last_synced_at: row.get(13)?,
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
    let existing_source = connection
        .query_row(
            "SELECT source FROM radar_items WHERE id = ?1",
            params![item.id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(error_message)?;
    if existing_source.as_deref() == Some("github_star") {
        let tags_json = serde_json::to_string(&item.tags).map_err(error_message)?;
        connection
            .execute(
                "
                UPDATE radar_items
                SET category = ?2, tags_json = ?3, note = ?4, favorite = ?5,
                    updated_at = strftime('%s','now')
                WHERE id = ?1
                ",
                params![
                    item.id,
                    item.category,
                    tags_json,
                    item.note,
                    if item.favorite { 1_i64 } else { 0_i64 }
                ],
            )
            .map_err(error_message)?;
        return Ok(());
    }

    let tags_json = serde_json::to_string(&item.tags).map_err(error_message)?;
    connection
        .execute(
            "
            INSERT INTO radar_items(id, name, category, url, tags_json, note, favorite, source)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, 'manual')
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                category = excluded.category,
                url = excluded.url,
                tags_json = excluded.tags_json,
                note = excluded.note,
                favorite = excluded.favorite,
                updated_at = strftime('%s','now')
            ",
            params![
                item.id,
                item.name,
                item.category,
                item.url,
                tags_json,
                item.note,
                if item.favorite { 1_i64 } else { 0_i64 }
            ],
        )
        .map_err(error_message)?;
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

    transaction
        .execute(
            "
            INSERT INTO radar_items(
                id, name, category, url, source, external_id, source_description,
                source_metadata_json, source_active, last_synced_at
            )
            VALUES(?1, ?2, '项目', ?3, 'github_star', ?4, ?5, ?6, 1, strftime('%s','now'))
            ",
            params![
                format!("github-star:{}", star.name),
                star.name,
                star.html_url,
                star.name,
                description,
                metadata_json
            ],
        )
        .map_err(error_message)?;
    Ok(SyncOutcome::Added)
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
    if !RADAR_SOURCES.contains(&item.source.as_str()) {
        return Err("Radar 条目来源无效".to_string());
    }
    if !item.url.trim().is_empty() {
        validate_url(&item.url)?;
    }
    Ok(())
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
            url: "https://example.com".to_string(),
            tags: vec!["AI".to_string(), "本地工具".to_string()],
            note: "note".to_string(),
            favorite: false,
            updated_at: String::new(),
            source: "manual".to_string(),
            external_id: String::new(),
            source_description: String::new(),
            source_metadata: RadarSourceMetadata::default(),
            source_active: true,
            last_synced_at: String::new(),
        }
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
