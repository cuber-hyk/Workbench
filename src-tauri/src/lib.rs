mod projects;
mod radar;
mod skills;

#[tauri::command]
fn app_health() -> &'static str {
    "ok"
}

pub fn run() {
    tauri::Builder::default()
        .manage(projects::LaunchSessionRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_health,
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
            radar::sync_github_stars,
            skills::get_skills_state,
            skills::set_skills_root,
            skills::set_skill_category,
            skills::create_skill_category,
            skills::rename_skill_category,
            skills::delete_skill_category,
            skills::merge_skill_category,
            skills::import_skills_from_folder,
            skills::import_skills_from_zip,
            skills::set_skill_enabled,
            skills::open_local_path,
            skills::select_skill_import_source,
            skills::resolve_skill_conflict,
            skills::delete_skill,
            skills::open_global_skill_target,
            skills::open_skill_source_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Workbench App");
}
