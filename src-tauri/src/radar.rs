use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

type RadarResult<T> = Result<T, String>;

const RADAR_CATEGORIES: [&str; 4] = ["项目", "资讯", "论文", "其他"];

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
    Ok(connection)
}

fn load_radar_items(connection: &Connection) -> RadarResult<Vec<RadarItem>> {
    let mut statement = connection
        .prepare(
            "
            SELECT id, name, category, url, tags_json, note, favorite,
                   date(updated_at, 'unixepoch', 'localtime')
            FROM radar_items
            ORDER BY favorite DESC, updated_at DESC, lower(name)
            ",
        )
        .map_err(error_message)?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(4)?;
            Ok(RadarItem {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                url: row.get(3)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                note: row.get(5)?,
                favorite: row.get::<_, i64>(6)? != 0,
                updated_at: row.get(7)?,
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
    let tags_json = serde_json::to_string(&item.tags).map_err(error_message)?;
    connection
        .execute(
            "
            INSERT INTO radar_items(id, name, category, url, tags_json, note, favorite)
            VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
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
        }
    }

    #[test]
    fn persists_updates_and_deletes_radar_item() {
        let dir = tempdir().unwrap();
        let connection = open_database(dir.path()).unwrap();
        let mut item = sample_item();

        upsert_radar_item(&connection, &item).unwrap();
        let items = load_radar_items(&connection).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Demo");

        item.name = "Demo Updated".to_string();
        item.favorite = true;
        upsert_radar_item(&connection, &item).unwrap();
        let items = load_radar_items(&connection).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Demo Updated");
        assert!(items[0].favorite);

        connection
            .execute("DELETE FROM radar_items WHERE id = ?1", params![item.id])
            .unwrap();
        assert!(load_radar_items(&connection).unwrap().is_empty());
    }

    #[test]
    fn rejects_invalid_category_and_url() {
        let mut item = sample_item();
        item.category = "模型".to_string();
        assert!(validate_radar_item(&item).is_err());

        item.category = "其他".to_string();
        item.url = "example.com".to_string();
        assert!(validate_radar_item(&item).is_err());
    }

    #[test]
    fn accepts_empty_url() {
        let mut item = sample_item();
        item.url = String::new();
        assert!(validate_radar_item(&item).is_ok());
    }
}
