mod projects;
mod radar;
mod skills;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

#[tauri::command]
fn app_health() -> &'static str {
    "ok"
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "无法获取主窗口".to_string())?;
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "无法获取主窗口".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示 Workbench", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let icon = app.default_window_icon().cloned();
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Workbench")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = show_main_window(app);
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = icon {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(projects::LaunchSessionRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(setup_tray)
        .invoke_handler(tauri::generate_handler![
            app_health,
            hide_main_window,
            exit_app,
            projects::list_projects,
            projects::launch_project,
            projects::restart_launch_session,
            projects::stop_launch_session,
            projects::stop_launch_run,
            projects::get_launch_run_snapshot,
            projects::delete_project_open_profile,
            projects::list_project_open_profiles,
            projects::open_project_with_profile,
            projects::select_directory,
            projects::select_project_open_executable,
            projects::save_project,
            projects::save_project_open_profile,
            radar::delete_radar_item,
            radar::list_radar_duplicate_groups,
            radar::list_radar_items,
            radar::merge_radar_duplicate_group,
            radar::open_radar_link,
            radar::save_radar_item,
            radar::check_github_cli_status,
            radar::sync_github_stars,
            skills::get_skills_state,
            skills::set_skills_root,
            skills::set_close_behavior,
            skills::set_close_tray_hint_dismissed,
            skills::set_tool_target_order,
            skills::save_custom_tool_target,
            skills::delete_custom_tool_target,
            skills::select_tool_icon_source,
            skills::set_skill_category,
            skills::create_skill_category,
            skills::rename_skill_category,
            skills::delete_skill_category,
            skills::merge_skill_category,
            skills::list_skill_market,
            skills::get_skill_market_detail,
            skills::install_skill_from_market,
            skills::list_skill_updates,
            skills::check_skill_updates,
            skills::update_skill_from_market,
            skills::update_market_skills,
            skills::discover_external_skills,
            skills::sync_external_skills,
            skills::inspect_skills_root_migration,
            skills::migrate_skills_root,
            skills::rebuild_managed_skill_targets,
            skills::import_skills_from_folder,
            skills::import_skills_from_zip,
            skills::set_skill_enabled,
            skills::open_local_path,
            skills::select_skill_import_source,
            skills::resolve_skill_conflict,
            skills::delete_skill,
            skills::open_global_skill_target,
            skills::open_skill_source_directory,
            skills::create_and_open_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Workbench");
}
