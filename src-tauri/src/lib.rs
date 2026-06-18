mod db;
mod recents;

use db::DbState;

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(DbState::default())
        .invoke_handler(tauri::generate_handler![
            db::open_database,
            db::close_database,
            db::list_tables,
            db::get_columns,
            db::count_rows,
            db::get_rows,
            db::execute_sql,
            recents::get_recent_files,
            recents::add_recent_file,
            recents::remove_recent_file,
            save_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
