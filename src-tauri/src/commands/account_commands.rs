use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

pub fn profile_root(app: &tauri::AppHandle, space: Option<&str>) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    match space.unwrap_or("legacy") {
        "legacy" => Ok(root),
        s if !s.is_empty() && s.len() <= 100 && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') => Ok(root.join("profiles").join(s)),
        _ => Err("Invalid local profile".into()),
    }
}

#[tauri::command]
pub async fn account_local_state(app: tauri::AppHandle, window: tauri::WebviewWindow, revision: Option<i64>, value: Option<Value>) -> Result<Value, String> {
    if window.label() != "main" { return Err("Account access is limited to the main window".into()); }
    let root = profile_root(&app, None)?;
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let mut db = Connection::open(root.join("accounts.sqlite3")).map_err(|e| e.to_string())?;
        db.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| e.to_string())?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS account_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL)").map_err(|e| e.to_string())?;
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let current: Option<(i64,String)> = tx.query_row("SELECT revision,data FROM account_state WHERE id=1", [], |r| Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e| e.to_string())?;
        if let Some(next) = value {
            if current.as_ref().map(|v| v.0) != revision { return Ok(Value::Bool(false)); }
            let next_revision = next["revision"].as_i64().ok_or("Missing revision")?;
            if next_revision != revision.map(|n| n + 1).unwrap_or(0) { return Err("Invalid revision".into()); }
            tx.execute("INSERT INTO account_state VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data", params![next_revision,next.to_string()]).map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?; Ok(Value::Bool(true))
        } else { match current { Some((_,data)) => serde_json::from_str(&data).map_err(|e| e.to_string()), None => Ok(Value::Null) } }
    }).await.map_err(|e| e.to_string())?
}
