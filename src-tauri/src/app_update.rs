use serde::{Deserialize, Serialize};
use std::time::Duration;

const WORKBENCH_RELEASES_API: &str = "https://api.github.com/repos/cuber-hyk/Workbench/releases";
const RELEASES_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppReleaseNotes {
    #[serde(alias = "tag_name")]
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    #[serde(alias = "published_at")]
    pub published_at: Option<String>,
    pub draft: bool,
    pub prerelease: bool,
}

#[tauri::command]
pub fn list_app_releases() -> Result<Vec<AppReleaseNotes>, String> {
    fetch_app_releases(WORKBENCH_RELEASES_API)
}

fn fetch_app_releases(url: &str) -> Result<Vec<AppReleaseNotes>, String> {
    let response = ureq::get(url)
        .set("User-Agent", "Workbench")
        .set("Accept", "application/vnd.github+json")
        .timeout(RELEASES_REQUEST_TIMEOUT)
        .call()
        .map_err(|error| format!("读取 GitHub Releases 失败: {error}"))?;

    response
        .into_json::<Vec<AppReleaseNotes>>()
        .map_err(|error| format!("解析 GitHub Releases 失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::AppReleaseNotes;

    #[test]
    fn parses_github_release_notes_payload() {
        let releases: Vec<AppReleaseNotes> = serde_json::from_str(
            r##"[
              {
                "tag_name": "v0.2.2",
                "name": "Workbench v0.2.2",
                "body": "更新累计说明",
                "published_at": "2026-06-25T04:40:46Z",
                "draft": false,
                "prerelease": false
              }
            ]"##,
        )
        .unwrap();

        assert_eq!(releases[0].tag_name, "v0.2.2");
        assert_eq!(releases[0].name.as_deref(), Some("Workbench v0.2.2"));
        assert!(!releases[0].draft);
        assert!(!releases[0].prerelease);
    }
}
