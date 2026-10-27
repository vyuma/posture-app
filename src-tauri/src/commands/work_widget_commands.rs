use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[derive(Default)]
pub struct WorkWidgetState(pub Mutex<Option<Value>>);

#[tauri::command]
pub fn work_preview_window(window: WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    if !cfg!(debug_assertions) || window.label() != "main" || !window.url().map_err(|e| e.to_string())?.path().starts_with("/dev/work") {
        return Err("only the development preview can resize this window".into());
    }
    if !(720..=1920).contains(&width) || !(540..=1200).contains(&height) { return Err("preview size out of range".into()); }
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn work_widget_get(state: State<'_, WorkWidgetState>) -> Result<Option<Value>, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn work_widget_update(app: AppHandle, window: WebviewWindow, state: State<'_, WorkWidgetState>, value: Option<Value>) -> Result<(), String> {
    if window.label() != "main" { return Err("only main owns the measurement".into()); }
    let mut stored = state.0.lock().map_err(|e| e.to_string())?;
    let was_visible = stored.is_some();
    let was_bad = stored.as_ref().and_then(|v| v.get("bad")).and_then(Value::as_bool).unwrap_or(false);
    let bad = value.as_ref().and_then(|v| v.get("bad")).and_then(Value::as_bool).unwrap_or(false);
    if was_visible != value.is_some() || was_bad != bad {
        crate::overlay::window::set_work_widget(&app, value.is_some(), bad)?;
    }
    *stored = value.clone();
    app.emit_to("cat_overlay", "work:widget", value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn work_widget_action(app: AppHandle, window: WebviewWindow, state: State<'_, WorkWidgetState>, session_id: String, action: String) -> Result<(), String> {
    if window.label() != "cat_overlay" { return Err("only widget sends widget actions".into()); }
    let stored = state.0.lock().map_err(|e| e.to_string())?;
    if stored.as_ref().and_then(|v| v.get("sessionId")).and_then(Value::as_str) != Some(session_id.as_str()) { return Err("stale measurement".into()); }
    if !["open", "pause", "resume", "finish"].contains(&action.as_str()) { return Err("unknown action".into()); }
    if action == "open" || action == "finish" { crate::overlay::window::open_main_window(&app)?; }
    app.emit_to("main", "work:action", json!({ "sessionId": session_id, "action": action })).map_err(|e| e.to_string())
}
