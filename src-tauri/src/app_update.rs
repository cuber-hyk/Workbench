use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyWorkbenchShortcut {
    pub path: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyWorkbenchInstall {
    pub found: bool,
    pub display_name: Option<String>,
    pub display_version: Option<String>,
    pub install_location: Option<String>,
    pub executable_path: Option<String>,
    pub uninstall_string: Option<String>,
    pub shortcuts: Vec<LegacyWorkbenchShortcut>,
}

#[tauri::command]
pub fn list_app_releases() -> Result<Vec<AppReleaseNotes>, String> {
    fetch_app_releases(WORKBENCH_RELEASES_API)
}

#[tauri::command]
pub fn inspect_legacy_workbench_install() -> Result<LegacyWorkbenchInstall, String> {
    inspect_legacy_install()
}

#[tauri::command]
pub fn delete_legacy_workbench_shortcuts() -> Result<LegacyWorkbenchInstall, String> {
    let current = inspect_legacy_install()?;
    for shortcut in &current.shortcuts {
        let path = Path::new(&shortcut.path);
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false)
        {
            fs::remove_file(path)
                .map_err(|error| format!("删除旧版快捷方式失败: {} ({error})", shortcut.path))?;
        }
    }
    inspect_legacy_install()
}

#[tauri::command]
pub fn open_legacy_workbench_uninstaller() -> Result<(), String> {
    let current = inspect_legacy_install()?;
    let uninstall_path = current
        .uninstall_string
        .as_deref()
        .and_then(first_windows_command_path)
        .ok_or_else(|| "没有找到旧版 Workbench App 的卸载程序。".to_string())?;

    if !uninstall_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case("uninstall.exe"))
        .unwrap_or(false)
    {
        return Err("旧版卸载命令不是预期的 uninstall.exe，已停止打开。".to_string());
    }

    Command::new(&uninstall_path)
        .spawn()
        .map_err(|error| format!("打开旧版卸载程序失败: {error}"))?;
    Ok(())
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

#[cfg(target_os = "windows")]
fn inspect_legacy_install() -> Result<LegacyWorkbenchInstall, String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut command = Command::new("powershell");
    command
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            LEGACY_INSTALL_INSPECTION_SCRIPT,
        ])
        .creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|error| format!("检查旧版 Workbench App 安装失败: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "检查旧版 Workbench App 安装失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    serde_json::from_slice::<LegacyWorkbenchInstall>(&output.stdout)
        .map_err(|error| format!("解析旧版安装信息失败: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn inspect_legacy_install() -> Result<LegacyWorkbenchInstall, String> {
    Ok(LegacyWorkbenchInstall {
        found: false,
        display_name: None,
        display_version: None,
        install_location: None,
        executable_path: None,
        uninstall_string: None,
        shortcuts: Vec::new(),
    })
}

#[cfg(target_os = "windows")]
const LEGACY_INSTALL_INSPECTION_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$registryPaths = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$entry = Get-ItemProperty $registryPaths |
  Where-Object { $_.DisplayName -eq 'Workbench App' } |
  Select-Object -First 1
$roots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$shortcuts = @()
$shell = New-Object -ComObject WScript.Shell
foreach ($shortcut in Get-ChildItem -LiteralPath $roots -Recurse -Filter *.lnk -ErrorAction SilentlyContinue) {
  $link = $shell.CreateShortcut($shortcut.FullName)
  if ($link.TargetPath -and ((Split-Path -Leaf $link.TargetPath) -ieq 'workbench-app.exe')) {
    $shortcuts += [PSCustomObject]@{
      path = $shortcut.FullName
      target = $link.TargetPath
    }
  }
}
$result = [PSCustomObject]@{
  found = [bool]$entry -or ($shortcuts.Count -gt 0)
  displayName = if ($entry) { $entry.DisplayName } else { $null }
  displayVersion = if ($entry) { $entry.DisplayVersion } else { $null }
  installLocation = if ($entry) { ($entry.InstallLocation -replace '^"|"$','') } else { $null }
  executablePath = if ($entry -and $entry.DisplayIcon) { ($entry.DisplayIcon -replace '^"|"$','') } else { $null }
  uninstallString = if ($entry) { $entry.UninstallString } else { $null }
  shortcuts = @($shortcuts)
}
$result | ConvertTo-Json -Depth 4 -Compress
"#;

fn first_windows_command_path(command: &str) -> Option<std::path::PathBuf> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(rest) = trimmed.strip_prefix('"') {
        let end = rest.find('"')?;
        return Some(std::path::PathBuf::from(&rest[..end]));
    }
    let end = trimmed.find(' ').unwrap_or(trimmed.len());
    Some(std::path::PathBuf::from(&trimmed[..end]))
}

#[cfg(test)]
mod tests {
    use super::{first_windows_command_path, AppReleaseNotes};

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

    #[test]
    fn parses_quoted_windows_uninstall_path() {
        let path = first_windows_command_path("\"D:\\Workbench\\uninstall.exe\" /S").unwrap();

        assert_eq!(path.to_string_lossy(), "D:\\Workbench\\uninstall.exe");
    }
}
