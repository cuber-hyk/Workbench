use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::error_message;
use super::normalize::{normalize_resource_url, normalize_sources, parse_sources, validate_url};
use super::types::{RadarItem, RADAR_CATEGORIES, RADAR_SOURCES};
use super::RadarResult;

pub(crate) fn open_database(workbench_root: &Path) -> RadarResult<Connection> {
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

pub(crate) fn load_radar_items(connection: &Connection) -> RadarResult<Vec<RadarItem>> {
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

pub(crate) fn upsert_radar_item(connection: &Connection, item: &RadarItem) -> RadarResult<()> {
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

pub(crate) fn delete_radar_item(connection: &Connection, id: &str) -> RadarResult<()> {
    connection
        .execute("DELETE FROM radar_items WHERE id = ?1", params![id])
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

pub(crate) fn validate_radar_item(item: &RadarItem) -> RadarResult<()> {
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
