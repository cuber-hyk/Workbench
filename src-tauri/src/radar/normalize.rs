use std::process::Command;

use super::types::RADAR_SOURCES;
use super::RadarResult;

pub(crate) fn parse_sources(sources_json: &str, fallback: &str) -> Vec<String> {
    let parsed: Vec<String> = serde_json::from_str(sources_json).unwrap_or_default();
    normalize_sources(&parsed, fallback)
}

pub(crate) fn normalize_sources(sources: &[String], fallback: &str) -> Vec<String> {
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

pub(crate) fn add_source(mut sources: Vec<String>, source: &str) -> Vec<String> {
    if RADAR_SOURCES.contains(&source) && !sources.contains(&source.to_string()) {
        sources.push(source.to_string());
    }
    sources
}

pub(crate) fn normalize_github_url(url: &str) -> String {
    let trimmed = normalize_resource_url(url);
    trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("http://github.com/"))
        .map(|path| format!("https://github.com/{}", path))
        .unwrap_or(trimmed)
}

pub(crate) fn normalize_resource_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    trimmed.to_lowercase()
}

pub(crate) fn validate_url(url: &str) -> RadarResult<()> {
    let trimmed = url.trim();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        Ok(())
    } else {
        Err("链接必须使用 http:// 或 https://".to_string())
    }
}

#[cfg(windows)]
pub(crate) fn open_url(url: &str) -> RadarResult<()> {
    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map_err(|error| format!("打开链接失败: {error}"))?;
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn open_url(_url: &str) -> RadarResult<()> {
    Err("当前系统暂不支持打开链接".to_string())
}
