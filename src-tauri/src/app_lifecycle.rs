use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn is_launch_at_startup_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_launch_at_startup(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let autolaunch = app.autolaunch();
    if cfg!(debug_assertions) && enabled {
        return Err(
            "开发版不支持开启开机自启动；请使用正式安装包开启，避免开机时加载本地开发服务器失败。"
                .to_string(),
        );
    }
    if enabled {
        autolaunch.enable().map_err(|error| error.to_string())?;
    } else {
        autolaunch.disable().map_err(|error| error.to_string())?;
    }
    autolaunch.is_enabled().map_err(|error| error.to_string())
}
