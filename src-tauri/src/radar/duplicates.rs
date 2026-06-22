use rusqlite::{params, Connection, OptionalExtension, Transaction};

use super::db::load_radar_items;
use super::error_message;
use super::normalize::add_source;
use super::types::{RadarDuplicateGroup, RadarItem};
use super::RadarResult;

pub(crate) fn upsert_duplicate_group(
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

pub(crate) fn load_open_duplicate_groups(
    connection: &Connection,
) -> RadarResult<Vec<RadarDuplicateGroup>> {
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

pub(crate) fn merge_duplicate_group(
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
