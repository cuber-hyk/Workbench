use serde::{Deserialize, Serialize};

pub(crate) const RADAR_CATEGORIES: [&str; 4] = ["项目", "资讯", "论文", "其他"];
pub(crate) const RADAR_SOURCES: [&str; 2] = ["manual", "github_star"];
pub(crate) const DEFAULT_RADAR_DOMAIN: &str = "未分类";

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCliStatus {
    pub status: String,
    pub account: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub(crate) struct GitHubStar {
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) html_url: String,
    #[serde(default)]
    pub(crate) stars: i64,
    pub(crate) language: Option<String>,
    #[serde(default)]
    pub(crate) topics: Vec<String>,
    pub(crate) updated_at: String,
}
