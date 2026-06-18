//! Saved SQL queries persistence.
//!
//! Queries are stored as JSON in the app config directory so they survive
//! restarts. Each query has a stable id (epoch-ms string) used for deletion.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const FILE_NAME: &str = "saved_queries.json";

#[derive(Serialize, Deserialize, Clone)]
pub struct SavedQuery {
    pub id: String,
    pub name: String,
    pub sql: String,
    pub created_at: i64,
}

fn queries_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir unavailable: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

fn load(app: &tauri::AppHandle) -> Vec<SavedQuery> {
    let Ok(path) = queries_path(app) else {
        return Vec::new();
    };
    let Ok(text) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn persist(app: &tauri::AppHandle, list: &[SavedQuery]) -> Result<(), String> {
    let path = queries_path(app)?;
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn get_saved_queries(app: tauri::AppHandle) -> Vec<SavedQuery> {
    load(&app)
}

#[tauri::command]
pub fn save_query(
    app: tauri::AppHandle,
    name: String,
    sql: String,
) -> Result<Vec<SavedQuery>, String> {
    let mut list = load(&app);
    let id = now_millis().to_string();
    list.push(SavedQuery { id, name, sql, created_at: now_millis() });
    persist(&app, &list)?;
    Ok(list)
}

#[tauri::command]
pub fn delete_query(app: tauri::AppHandle, id: String) -> Result<Vec<SavedQuery>, String> {
    let mut list = load(&app);
    list.retain(|q| q.id != id);
    persist(&app, &list)?;
    Ok(list)
}

#[tauri::command]
pub fn rename_query(
    app: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<Vec<SavedQuery>, String> {
    let mut list = load(&app);
    if let Some(q) = list.iter_mut().find(|q| q.id == id) {
        q.name = name;
    }
    persist(&app, &list)?;
    Ok(list)
}
