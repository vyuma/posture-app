//! Local measurement storage. Pairing is deliberately not involved in this boundary.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::{json, Value};
use std::{path::PathBuf, time::Duration};
use tauri::Manager;

fn decode(value: Option<String>) -> Result<Value, String> {
    value.map(|text| serde_json::from_str(&text).map_err(|e| e.to_string())).unwrap_or(Ok(Value::Null))
}
fn execute(path: PathBuf, operation: &str, payload: Value) -> Result<Value, String> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let mut db = Connection::open(path).map_err(|e| e.to_string())?;
    db.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS work_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS work_sessions (id TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS work_status ON work_sessions(status);").map_err(|e| e.to_string())?;
    let result: Result<Value, rusqlite::Error> = (|| {
        match operation {
            "collection" => Ok(decode(db.query_row("SELECT data FROM work_meta WHERE id=1", [], |row| row.get(0)).optional()?).map_err(|_| rusqlite::Error::InvalidQuery)?),
            "session" => Ok(decode(db.query_row("SELECT data FROM work_sessions WHERE id=?1", [payload["id"].as_str().unwrap_or("")], |row| row.get(0)).optional()?).map_err(|_| rusqlite::Error::InvalidQuery)?),
            "interrupted" => {
                let mut statement = db.prepare("SELECT data FROM work_sessions WHERE status IN ('running','paused','recalibrating')")?;
                let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
                let mut values = Vec::new();
                for row in rows { values.push(serde_json::from_str::<Value>(&row?).map_err(|_| rusqlite::Error::InvalidQuery)?); }
                Ok(json!(values))
            },
            "checkpoint" => {
                let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
                let session = &payload["session"]; let id = session["id"].as_str().ok_or(rusqlite::Error::InvalidQuery)?;
                let status = session["status"].as_str().ok_or(rusqlite::Error::InvalidQuery)?;
                let previous: Option<String> = tx.query_row("SELECT status FROM work_sessions WHERE id=?1", [id], |row| row.get(0)).optional()?;
                if !matches!(previous.as_deref(), Some("completed" | "interrupted")) {
                    tx.execute("INSERT INTO work_sessions(id,status,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data", params![id,status,session.to_string()])?;
                }
                tx.commit()?; Ok(Value::Null)
            },
            "commit" => {
                let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
                let current: Option<i64> = tx.query_row("SELECT revision FROM work_meta WHERE id=1", [], |row| row.get(0)).optional()?;
                if current != payload["revision"].as_i64() { return Ok(json!(false)); }
                if let Some(session) = payload.get("session").filter(|s| !s.is_null()) {
                    let id = session["id"].as_str().ok_or(rusqlite::Error::InvalidQuery)?;
                    let previous: Option<String> = tx.query_row("SELECT status FROM work_sessions WHERE id=?1", [id], |row| row.get(0)).optional()?;
                    if matches!(previous.as_deref(), Some("completed" | "interrupted")) { return Ok(json!(false)); }
                    tx.execute("INSERT INTO work_sessions(id,status,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data", params![id,session["status"].as_str().unwrap_or("completed"),session.to_string()])?;
                }
                let collection = &payload["collection"];
                tx.execute("INSERT INTO work_meta(id,revision,data) VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data", params![collection["revision"].as_i64().ok_or(rusqlite::Error::InvalidQuery)?,collection.to_string()])?;
                tx.commit()?; Ok(json!(true))
            },
            _ => Err(rusqlite::Error::InvalidQuery),
        }
    })();
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn work_database(app: tauri::AppHandle, window: tauri::WebviewWindow, operation: String, payload: Option<Value>) -> Result<Value, String> {
    if window.label() != "main" { return Err("measurement storage is owned by the main window".into()); }
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("measurements.sqlite3");
    tauri::async_runtime::spawn_blocking(move || execute(path, &operation, payload.unwrap_or(Value::Null))).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn result_and_collection_are_atomic_and_reset_rejects_stale_writes() {
        let path = std::env::temp_dir().join(format!("piiin-work-{}.sqlite3", std::process::id()));
        let _ = std::fs::remove_file(&path);
        assert_eq!(execute(path.clone(), "commit", json!({"revision":null,"collection":{"revision":0,"generation":0,"cards":[]}})).unwrap(), json!(true));
        let session = json!({"id":"one","status":"completed","samples":[]});
        assert_eq!(execute(path.clone(), "commit", json!({"revision":0,"collection":{"revision":1,"generation":0,"cards":["one"]},"session":session})).unwrap(), json!(true));
        assert_eq!(execute(path.clone(), "commit", json!({"revision":1,"collection":{"revision":2,"generation":1,"cards":[]}})).unwrap(), json!(true));
        assert_eq!(execute(path.clone(), "commit", json!({"revision":1,"collection":{"revision":2,"generation":0,"cards":["one"]},"session":session})).unwrap(), json!(false));
        assert_eq!(execute(path.clone(), "session", json!({"id":"one"})).unwrap()["status"], "completed");
        let _ = std::fs::remove_file(path);
    }
}
