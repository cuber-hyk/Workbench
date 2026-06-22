mod db;
mod duplicates;
mod github;
mod normalize;
mod types;

use std::path::PathBuf;

pub use types::{GitHubCliStatus, GitHubStarsSyncResult, RadarDuplicateGroup, RadarItem};

type RadarResult<T> = Result<T, String>;

#[tauri::command]
pub fn list_radar_items() -> RadarResult<Vec<RadarItem>> {
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::load_radar_items(&connection)
}

#[tauri::command]
pub fn save_radar_item(item: RadarItem) -> RadarResult<Vec<RadarItem>> {
    db::validate_radar_item(&item)?;
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::upsert_radar_item(&connection, &item)?;
    db::load_radar_items(&connection)
}

#[tauri::command]
pub fn delete_radar_item(id: String) -> RadarResult<Vec<RadarItem>> {
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    db::delete_radar_item(&connection, &id)?;
    db::load_radar_items(&connection)
}

#[tauri::command]
pub fn list_radar_duplicate_groups() -> RadarResult<Vec<RadarDuplicateGroup>> {
    let workbench_root = default_workbench_root()?;
    let connection = db::open_database(&workbench_root)?;
    duplicates::load_open_duplicate_groups(&connection)
}

#[tauri::command]
pub fn merge_radar_duplicate_group(
    group_id: String,
    primary_item_id: String,
) -> RadarResult<Vec<RadarItem>> {
    let workbench_root = default_workbench_root()?;
    let mut connection = db::open_database(&workbench_root)?;
    duplicates::merge_duplicate_group(&mut connection, &group_id, &primary_item_id)?;
    db::load_radar_items(&connection)
}

#[tauri::command]
pub async fn sync_github_stars() -> RadarResult<GitHubStarsSyncResult> {
    tauri::async_runtime::spawn_blocking(|| {
        let stars = github::fetch_github_stars()?;
        let workbench_root = default_workbench_root()?;
        let mut connection = db::open_database(&workbench_root)?;
        github::sync_github_stars_into_database(&mut connection, &stars)
    })
    .await
    .map_err(|error| format!("GitHub Stars 同步任务失败：{error}"))?
}

#[tauri::command]
pub async fn check_github_cli_status() -> RadarResult<GitHubCliStatus> {
    tauri::async_runtime::spawn_blocking(github::detect_github_cli_status)
        .await
        .map_err(|error| format!("GitHub CLI 状态检查失败：{error}"))?
}

#[tauri::command]
pub fn open_radar_link(url: String) -> RadarResult<()> {
    normalize::validate_url(&url)?;
    normalize::open_url(&url)
}

fn default_workbench_root() -> RadarResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".workbench"))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}

pub(crate) fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::db::{load_radar_items, open_database, upsert_radar_item, validate_radar_item};
    use super::duplicates::{load_open_duplicate_groups, merge_duplicate_group};
    use super::github::{
        classify_github_cli_auth_status, parse_github_stars, sync_github_stars_into_database,
    };
    use super::types::{GitHubStar, RadarSourceMetadata, DEFAULT_RADAR_DOMAIN};
    use super::*;
    use rusqlite::{params, Connection};
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

    #[test]
    fn classifies_github_cli_auth_status() {
        let ready = classify_github_cli_auth_status(
            true,
            "github.com\n  ✓ Logged in to github.com account octocat (keyring)",
        );
        assert_eq!(ready.status, "ready");
        assert_eq!(ready.account, "octocat");
        assert!(ready.message.contains("当前账号 octocat"));

        let unauthenticated = classify_github_cli_auth_status(
            false,
            "You are not logged into any GitHub hosts. Run gh auth login to authenticate.",
        );
        assert_eq!(unauthenticated.status, "unauthenticated");
        assert!(unauthenticated.message.contains("gh auth login"));
    }
}
