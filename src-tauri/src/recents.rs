//! Recent-files persistence.
//!
//! The list of recently opened databases (most-recent first, capped at 10) is
//! stored as JSON in the app config directory so it survives restarts.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const MAX_RECENTS: usize = 10;
const FILE_NAME: &str = "recent_files.json";

#[derive(Serialize, Deserialize, Clone)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    /// Unix epoch milliseconds of the last time this file was opened.
    pub last_opened: i64,
}

/// Resolve `<app config dir>/recent_files.json`, creating the directory if
/// needed.
fn recents_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir unavailable: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

/// Load the stored list, or an empty list if the file is missing/unreadable.
fn load(app: &tauri::AppHandle) -> Vec<RecentFile> {
    let Ok(path) = recents_path(app) else {
        return Vec::new();
    };
    let Ok(text) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save(app: &tauri::AppHandle, list: &[RecentFile]) -> Result<(), String> {
    let path = recents_path(app)?;
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn file_name_of(path: &str) -> String {
    path.replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .to_string()
}

#[tauri::command]
pub fn get_recent_files(app: tauri::AppHandle) -> Vec<RecentFile> {
    load(&app)
}

#[tauri::command]
pub fn add_recent_file(app: tauri::AppHandle, path: String) -> Result<Vec<RecentFile>, String> {
    let mut list = load(&app);
    // Drop any existing entry for this path, then push the fresh one to front.
    list.retain(|r| r.path != path);
    list.insert(
        0,
        RecentFile {
            name: file_name_of(&path),
            path,
            last_opened: now_millis(),
        },
    );
    list.truncate(MAX_RECENTS);
    save(&app, &list)?;
    Ok(list)
}

#[tauri::command]
pub fn remove_recent_file(app: tauri::AppHandle, path: String) -> Result<Vec<RecentFile>, String> {
    let mut list = load(&app);
    list.retain(|r| r.path != path);
    save(&app, &list)?;
    Ok(list)
}
