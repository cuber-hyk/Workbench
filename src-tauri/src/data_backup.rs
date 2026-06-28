use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use rusqlite::{params, Connection};

type BackupResult<T> = Result<T, String>;

const BACKUP_FORMAT_VERSION: u16 = 1;
const MANIFEST_ENTRY: &str = "manifest.json";
const SQLITE_ENTRY: &str = "workbench.sqlite";
const AUTO_BACKUP_ENABLED_SETTING: &str = "auto_backup_enabled";
const AUTO_BACKUP_RETENTION_SETTING: &str = "auto_backup_retention";
const AUTO_BACKUP_LAST_COMPLETED_AT_SETTING: &str = "auto_backup_last_completed_at";
const DEFAULT_AUTO_BACKUP_RETENTION: u16 = 10;
const AUTO_BACKUP_DELAY: Duration = Duration::from_secs(5 * 60);
const AUTO_BACKUP_MIN_INTERVAL_MILLIS: u128 = 30 * 60 * 1000;

#[derive(Clone, Default)]
pub struct AutoBackupScheduler {
    generation: Arc<AtomicU64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataBackupManifest {
    pub backup_format_version: u16,
    pub created_at: String,
    pub app_version: String,
    pub source_workbench_root: String,
    pub sqlite_file_name: String,
    pub sqlite_size_bytes: u64,
    pub includes_skills_directory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataBackupSummary {
    pub backup_path: String,
    pub backup_directory: String,
    pub sqlite_size_bytes: u64,
    pub manifest: LocalDataBackupManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataRestoreInspection {
    pub backup_path: String,
    pub manifest: LocalDataBackupManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataRestoreSummary {
    pub restored_database_path: String,
    pub previous_database_backup_path: String,
    pub manifest: LocalDataBackupManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupSettings {
    pub enabled: bool,
    pub retention: u16,
    pub last_backup_at: Option<String>,
}

#[tauri::command]
pub fn create_local_data_backup() -> BackupResult<LocalDataBackupSummary> {
    create_local_data_backup_in(&default_workbench_root()?)
}

#[tauri::command]
pub fn get_auto_backup_settings() -> BackupResult<AutoBackupSettings> {
    let workbench_root = default_workbench_root()?;
    let connection = open_settings_database(&workbench_root)?;
    auto_backup_settings_from_database(&connection)
}

#[tauri::command]
pub fn set_auto_backup_settings(enabled: bool, retention: u16) -> BackupResult<AutoBackupSettings> {
    let retention = normalize_auto_backup_retention(retention)?;
    let workbench_root = default_workbench_root()?;
    let connection = open_settings_database(&workbench_root)?;
    set_json_setting(&connection, AUTO_BACKUP_ENABLED_SETTING, &enabled)?;
    set_json_setting(&connection, AUTO_BACKUP_RETENTION_SETTING, &retention)?;
    auto_backup_settings_from_database(&connection)
}

#[tauri::command]
pub fn mark_local_data_changed(
    scheduler: tauri::State<'_, AutoBackupScheduler>,
) -> BackupResult<()> {
    schedule_auto_backup(scheduler.inner().clone())
}

#[tauri::command]
pub async fn select_local_data_backup_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> BackupResult<Option<String>> {
    Ok(app
        .dialog()
        .file()
        .add_filter("Workbench backup", &["zip"])
        .blocking_pick_file()
        .map(|path| path.to_string()))
}

#[tauri::command]
pub fn inspect_local_data_backup(path: String) -> BackupResult<LocalDataRestoreInspection> {
    inspect_local_data_backup_file(Path::new(&path))
}

#[tauri::command]
pub fn restore_local_data_backup(path: String) -> BackupResult<LocalDataRestoreSummary> {
    restore_local_data_backup_in(&default_workbench_root()?, Path::new(&path))
}

fn create_local_data_backup_in(workbench_root: &Path) -> BackupResult<LocalDataBackupSummary> {
    create_data_backup_in(workbench_root, "workbench-backup")
}

fn create_auto_data_backup_in(
    workbench_root: &Path,
    retention: u16,
) -> BackupResult<LocalDataBackupSummary> {
    let summary = create_data_backup_in(workbench_root, "workbench-auto-backup")?;
    prune_auto_backups_in(&PathBuf::from(&summary.backup_directory), retention)?;
    Ok(summary)
}

fn create_data_backup_in(
    workbench_root: &Path,
    file_name_prefix: &str,
) -> BackupResult<LocalDataBackupSummary> {
    let database_path = workbench_root.join(SQLITE_ENTRY);
    if !database_path.is_file() {
        return Err("SQLite 数据库不存在，无法创建备份。".to_string());
    }

    let backup_directory = workbench_root.join("backups");
    fs::create_dir_all(&backup_directory).map_err(error_message)?;
    let created_at = timestamp_millis(SystemTime::now());
    let backup_path = backup_directory.join(format!("{file_name_prefix}-{created_at}.zip"));
    let sqlite_snapshot_path =
        backup_directory.join(format!(".workbench-backup-snapshot-{created_at}.sqlite"));
    snapshot_sqlite_database(&database_path, &sqlite_snapshot_path)?;
    let sqlite_size_bytes = fs::metadata(&sqlite_snapshot_path)
        .map_err(error_message)?
        .len();
    let manifest = LocalDataBackupManifest {
        backup_format_version: BACKUP_FORMAT_VERSION,
        created_at: created_at.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        source_workbench_root: workbench_root.to_string_lossy().to_string(),
        sqlite_file_name: SQLITE_ENTRY.to_string(),
        sqlite_size_bytes,
        includes_skills_directory: false,
    };

    write_backup_zip(&backup_path, &sqlite_snapshot_path, &manifest)?;
    let _ = fs::remove_file(&sqlite_snapshot_path);

    Ok(LocalDataBackupSummary {
        backup_path: backup_path.to_string_lossy().to_string(),
        backup_directory: backup_directory.to_string_lossy().to_string(),
        sqlite_size_bytes,
        manifest,
    })
}

fn schedule_auto_backup(scheduler: AutoBackupScheduler) -> BackupResult<()> {
    let workbench_root = default_workbench_root()?;
    let settings = {
        let connection = open_settings_database(&workbench_root)?;
        auto_backup_settings_from_database(&connection)?
    };
    if !settings.enabled {
        return Ok(());
    }

    let generation = scheduler.generation.fetch_add(1, Ordering::SeqCst) + 1;
    thread::spawn(move || {
        thread::sleep(AUTO_BACKUP_DELAY);
        if scheduler.generation.load(Ordering::SeqCst) != generation {
            return;
        }
        if let Err(error) = run_auto_backup_if_due(&workbench_root) {
            eprintln!("auto backup failed: {error}");
        }
    });
    Ok(())
}

fn run_auto_backup_if_due(workbench_root: &Path) -> BackupResult<Option<LocalDataBackupSummary>> {
    let connection = open_settings_database(workbench_root)?;
    let settings = auto_backup_settings_from_database(&connection)?;
    if !settings.enabled {
        return Ok(None);
    }

    let now = timestamp_millis(SystemTime::now());
    let last_completed_at = settings
        .last_backup_at
        .as_deref()
        .and_then(|value| value.parse::<u128>().ok());
    if !should_run_auto_backup(now, last_completed_at, AUTO_BACKUP_MIN_INTERVAL_MILLIS) {
        return Ok(None);
    }

    drop(connection);
    let summary = create_auto_data_backup_in(workbench_root, settings.retention)?;
    let connection = open_settings_database(workbench_root)?;
    set_json_setting(
        &connection,
        AUTO_BACKUP_LAST_COMPLETED_AT_SETTING,
        &summary.manifest.created_at,
    )?;
    Ok(Some(summary))
}

fn should_run_auto_backup(
    now_millis: u128,
    last_completed_at: Option<u128>,
    min_interval_millis: u128,
) -> bool {
    match last_completed_at {
        Some(last_completed_at) => {
            now_millis.saturating_sub(last_completed_at) >= min_interval_millis
        }
        None => true,
    }
}

fn prune_auto_backups_in(backup_directory: &Path, retention: u16) -> BackupResult<()> {
    let retention = usize::from(normalize_auto_backup_retention(retention)?);
    let mut backups = fs::read_dir(backup_directory)
        .map_err(error_message)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("workbench-auto-backup-") && name.ends_with(".zip"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    backups.sort();
    let remove_count = backups.len().saturating_sub(retention);
    for path in backups.into_iter().take(remove_count) {
        fs::remove_file(path).map_err(error_message)?;
    }
    Ok(())
}

fn normalize_auto_backup_retention(retention: u16) -> BackupResult<u16> {
    match retention {
        10 | 20 | 30 => Ok(retention),
        _ => Err("自动备份保留数量只能是 10、20 或 30。".to_string()),
    }
}

fn open_settings_database(workbench_root: &Path) -> BackupResult<Connection> {
    fs::create_dir_all(workbench_root).map_err(error_message)?;
    let connection = Connection::open(workbench_root.join(SQLITE_ENTRY)).map_err(error_message)?;
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )
        .map_err(error_message)?;
    Ok(connection)
}

fn auto_backup_settings_from_database(connection: &Connection) -> BackupResult<AutoBackupSettings> {
    let enabled = configured_json_setting(connection, AUTO_BACKUP_ENABLED_SETTING, false)?;
    let retention = configured_json_setting(
        connection,
        AUTO_BACKUP_RETENTION_SETTING,
        DEFAULT_AUTO_BACKUP_RETENTION,
    )
    .and_then(normalize_auto_backup_retention)?;
    let last_backup_at = configured_json_setting::<Option<String>>(
        connection,
        AUTO_BACKUP_LAST_COMPLETED_AT_SETTING,
        None,
    )?;
    Ok(AutoBackupSettings {
        enabled,
        retention,
        last_backup_at,
    })
}

fn configured_json_setting<T>(
    connection: &Connection,
    key: &str,
    default_value: T,
) -> BackupResult<T>
where
    T: for<'de> Deserialize<'de>,
{
    let configured = connection.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    );
    match configured {
        Ok(value) => serde_json::from_str(&value).map_err(error_message),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(default_value),
        Err(error) => Err(error.to_string()),
    }
}

fn set_json_setting<T>(connection: &Connection, key: &str, value: &T) -> BackupResult<()>
where
    T: Serialize,
{
    let value_json = serde_json::to_string(value).map_err(error_message)?;
    connection
        .execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value_json],
        )
        .map_err(error_message)?;
    Ok(())
}

fn snapshot_sqlite_database(database_path: &Path, snapshot_path: &Path) -> BackupResult<()> {
    if snapshot_path.exists() {
        fs::remove_file(snapshot_path).map_err(error_message)?;
    }
    let connection = Connection::open(database_path).map_err(error_message)?;
    connection
        .execute(
            "VACUUM INTO ?1",
            [snapshot_path.to_string_lossy().to_string()],
        )
        .map_err(error_message)?;
    Ok(())
}

fn write_backup_zip(
    backup_path: &Path,
    database_path: &Path,
    manifest: &LocalDataBackupManifest,
) -> BackupResult<()> {
    let file = File::create(backup_path).map_err(error_message)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let manifest_json = serde_json::to_vec_pretty(manifest).map_err(error_message)?;

    zip.start_file(MANIFEST_ENTRY, options)
        .map_err(error_message)?;
    zip.write_all(&manifest_json).map_err(error_message)?;

    zip.start_file(SQLITE_ENTRY, options)
        .map_err(error_message)?;
    let mut database = File::open(database_path).map_err(error_message)?;
    std::io::copy(&mut database, &mut zip).map_err(error_message)?;
    zip.finish().map_err(error_message)?;
    Ok(())
}

fn inspect_local_data_backup_file(path: &Path) -> BackupResult<LocalDataRestoreInspection> {
    let manifest = read_backup_manifest(path)?;
    validate_manifest(&manifest)?;
    ensure_sqlite_entry(path)?;
    Ok(LocalDataRestoreInspection {
        backup_path: path.to_string_lossy().to_string(),
        manifest,
    })
}

fn restore_local_data_backup_in(
    workbench_root: &Path,
    backup_path: &Path,
) -> BackupResult<LocalDataRestoreSummary> {
    let inspection = inspect_local_data_backup_file(backup_path)?;
    fs::create_dir_all(workbench_root).map_err(error_message)?;

    let database_path = workbench_root.join(SQLITE_ENTRY);
    let previous_database_backup_path = workbench_root.join(format!(
        "workbench.sqlite.before-restore-{}",
        timestamp_millis(SystemTime::now())
    ));
    if database_path.exists() {
        fs::copy(&database_path, &previous_database_backup_path).map_err(error_message)?;
    } else {
        File::create(&previous_database_backup_path).map_err(error_message)?;
    }

    let restore_temp_path = workbench_root.join(format!(
        ".workbench-restore-{}.sqlite",
        timestamp_millis(SystemTime::now())
    ));
    extract_sqlite_entry(backup_path, &restore_temp_path)?;
    if let Err(error) = validate_sqlite_database(&restore_temp_path) {
        let _ = fs::remove_file(&restore_temp_path);
        return Err(error);
    }
    fs::copy(&restore_temp_path, &database_path).map_err(error_message)?;
    let _ = fs::remove_file(&restore_temp_path);

    Ok(LocalDataRestoreSummary {
        restored_database_path: database_path.to_string_lossy().to_string(),
        previous_database_backup_path: previous_database_backup_path.to_string_lossy().to_string(),
        manifest: inspection.manifest,
    })
}

fn read_backup_manifest(path: &Path) -> BackupResult<LocalDataBackupManifest> {
    let file = File::open(path).map_err(error_message)?;
    let mut archive = ZipArchive::new(file).map_err(error_message)?;
    let mut manifest_file = archive
        .by_name(MANIFEST_ENTRY)
        .map_err(|_| "备份文件缺少 manifest.json，无法确认备份来源和格式。".to_string())?;
    let mut manifest_json = String::new();
    manifest_file
        .read_to_string(&mut manifest_json)
        .map_err(error_message)?;
    serde_json::from_str(&manifest_json).map_err(error_message)
}

fn ensure_sqlite_entry(path: &Path) -> BackupResult<()> {
    let file = File::open(path).map_err(error_message)?;
    let mut archive = ZipArchive::new(file).map_err(error_message)?;
    archive
        .by_name(SQLITE_ENTRY)
        .map_err(|_| "备份文件缺少 workbench.sqlite。".to_string())?;
    Ok(())
}

fn extract_sqlite_entry(backup_path: &Path, target_path: &Path) -> BackupResult<()> {
    let file = File::open(backup_path).map_err(error_message)?;
    let mut archive = ZipArchive::new(file).map_err(error_message)?;
    let mut sqlite_file = archive
        .by_name(SQLITE_ENTRY)
        .map_err(|_| "备份文件缺少 workbench.sqlite。".to_string())?;
    let mut target = File::create(target_path).map_err(error_message)?;
    std::io::copy(&mut sqlite_file, &mut target).map_err(error_message)?;
    Ok(())
}

fn validate_sqlite_database(database_path: &Path) -> BackupResult<()> {
    let connection = Connection::open(database_path).map_err(error_message)?;
    let result: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(error_message)?;
    if result == "ok" {
        Ok(())
    } else {
        Err("备份中的 SQLite 数据库完整性检查失败。".to_string())
    }
}

fn validate_manifest(manifest: &LocalDataBackupManifest) -> BackupResult<()> {
    if manifest.backup_format_version != BACKUP_FORMAT_VERSION {
        return Err("备份格式版本不受支持。".to_string());
    }
    if manifest.sqlite_file_name != SQLITE_ENTRY {
        return Err("备份清单中的 SQLite 文件名无效。".to_string());
    }
    if manifest.includes_skills_directory {
        return Err("当前版本不支持恢复包含 Skills 实体目录的备份。".to_string());
    }
    Ok(())
}

fn default_workbench_root() -> BackupResult<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".workbench"))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}

fn timestamp_millis(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn creates_backup_with_sqlite_and_manifest_only() {
        let directory = tempdir().unwrap();
        let database_path = directory.path().join(SQLITE_ENTRY);
        create_test_database(&database_path, "backup-db");

        let summary = create_local_data_backup_in(directory.path()).unwrap();
        let file = File::open(&summary.backup_path).unwrap();
        let archive = ZipArchive::new(file).unwrap();
        let names = archive.file_names().map(str::to_string).collect::<Vec<_>>();

        assert_eq!(names, vec![MANIFEST_ENTRY, SQLITE_ENTRY]);
        assert!(!summary.manifest.includes_skills_directory);
        assert!(summary.sqlite_size_bytes > 0);
    }

    #[test]
    fn inspects_valid_backup_manifest() {
        let directory = tempdir().unwrap();
        create_test_database(&directory.path().join(SQLITE_ENTRY), "backup-db");
        let summary = create_local_data_backup_in(directory.path()).unwrap();

        let inspection = inspect_local_data_backup_file(Path::new(&summary.backup_path)).unwrap();

        assert_eq!(
            inspection.manifest.backup_format_version,
            BACKUP_FORMAT_VERSION
        );
        assert_eq!(inspection.manifest.sqlite_file_name, SQLITE_ENTRY);
    }

    #[test]
    fn restore_saves_current_database_before_replacing_it() {
        let source = tempdir().unwrap();
        create_test_database(&source.path().join(SQLITE_ENTRY), "backup-db");
        let backup = create_local_data_backup_in(source.path()).unwrap();

        let target = tempdir().unwrap();
        create_test_database(&target.path().join(SQLITE_ENTRY), "current-db");
        let restore =
            restore_local_data_backup_in(target.path(), Path::new(&backup.backup_path)).unwrap();

        assert_eq!(
            read_test_database_value(&target.path().join(SQLITE_ENTRY)),
            "backup-db"
        );
        assert_eq!(
            read_test_database_value(Path::new(&restore.previous_database_backup_path)),
            "current-db"
        );
    }

    #[test]
    fn rejects_backup_without_manifest() {
        let directory = tempdir().unwrap();
        let backup_path = directory.path().join("broken.zip");
        let file = File::create(&backup_path).unwrap();
        let mut zip = ZipWriter::new(file);
        zip.start_file(SQLITE_ENTRY, SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"sqlite-content").unwrap();
        zip.finish().unwrap();

        let error = inspect_local_data_backup_file(&backup_path).unwrap_err();

        assert!(error.contains("manifest.json"));
    }

    #[test]
    fn restore_rejects_invalid_sqlite_payload() {
        let directory = tempdir().unwrap();
        let backup_path = directory.path().join("invalid-sqlite.zip");
        let manifest = LocalDataBackupManifest {
            backup_format_version: BACKUP_FORMAT_VERSION,
            created_at: "1".to_string(),
            app_version: "test".to_string(),
            source_workbench_root: directory.path().to_string_lossy().to_string(),
            sqlite_file_name: SQLITE_ENTRY.to_string(),
            sqlite_size_bytes: 12,
            includes_skills_directory: false,
        };
        let file = File::create(&backup_path).unwrap();
        let mut zip = ZipWriter::new(file);
        zip.start_file(MANIFEST_ENTRY, SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&serde_json::to_vec(&manifest).unwrap())
            .unwrap();
        zip.start_file(SQLITE_ENTRY, SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"not-sqlite").unwrap();
        zip.finish().unwrap();
        create_test_database(&directory.path().join(SQLITE_ENTRY), "current-db");

        let error = restore_local_data_backup_in(directory.path(), &backup_path).unwrap_err();

        assert!(error.contains("file is not a database") || error.contains("完整性检查失败"));
        assert_eq!(
            read_test_database_value(&directory.path().join(SQLITE_ENTRY)),
            "current-db"
        );
    }

    #[test]
    fn auto_backup_settings_default_to_disabled() {
        let directory = tempdir().unwrap();
        let connection = open_settings_database(directory.path()).unwrap();

        let settings = auto_backup_settings_from_database(&connection).unwrap();

        assert_eq!(
            settings,
            AutoBackupSettings {
                enabled: false,
                retention: DEFAULT_AUTO_BACKUP_RETENTION,
                last_backup_at: None
            }
        );
    }

    #[test]
    fn rejects_invalid_auto_backup_retention() {
        let error = normalize_auto_backup_retention(15).unwrap_err();

        assert!(error.contains("10、20 或 30"));
    }

    #[test]
    fn auto_backup_decision_obeys_min_interval() {
        assert!(should_run_auto_backup(1_000, None, 300));
        assert!(should_run_auto_backup(1_000, Some(600), 300));
        assert!(!should_run_auto_backup(1_000, Some(800), 300));
    }

    #[test]
    fn prune_auto_backups_keeps_manual_backups_and_latest_auto_files() {
        let directory = tempdir().unwrap();
        for index in 0..12 {
            File::create(
                directory
                    .path()
                    .join(format!("workbench-auto-backup-{index:03}.zip")),
            )
            .unwrap();
        }
        File::create(directory.path().join("workbench-backup-000.zip")).unwrap();

        prune_auto_backups_in(directory.path(), 10).unwrap();

        assert!(!directory
            .path()
            .join("workbench-auto-backup-000.zip")
            .exists());
        assert!(!directory
            .path()
            .join("workbench-auto-backup-001.zip")
            .exists());
        assert!(directory
            .path()
            .join("workbench-auto-backup-002.zip")
            .exists());
        assert!(directory.path().join("workbench-backup-000.zip").exists());
    }

    #[test]
    fn creates_auto_backup_with_auto_file_name() {
        let directory = tempdir().unwrap();
        create_test_database(&directory.path().join(SQLITE_ENTRY), "backup-db");

        let summary = create_auto_data_backup_in(directory.path(), 10).unwrap();

        assert!(Path::new(&summary.backup_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap()
            .starts_with("workbench-auto-backup-"));
    }

    fn create_test_database(path: &Path, value: &str) {
        let connection = Connection::open(path).unwrap();
        connection
            .execute("CREATE TABLE marker(value TEXT NOT NULL)", [])
            .unwrap();
        connection
            .execute("INSERT INTO marker(value) VALUES(?1)", [value])
            .unwrap();
    }

    fn read_test_database_value(path: &Path) -> String {
        let connection = Connection::open(path).unwrap();
        connection
            .query_row("SELECT value FROM marker LIMIT 1", [], |row| row.get(0))
            .unwrap()
    }
}
