mod projects;
mod skills;

#[tauri::command]
fn app_health() -> &'static str {
    "ok"
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_health,
            projects::list_projects,
            projects::launch_project,
            projects::save_project,
            skills::get_skills_state,
            skills::set_skills_root,
            skills::set_skill_category,
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
