use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[derive(Default)]
pub struct WorkWidgetState(pub Mutex<Option<Value>>);

fn is_active_bad(value: Option<&Value>) -> bool {
    value.is_some_and(|v| v.get("bad").and_then(Value::as_bool) == Some(true)
        && v.get("paused").and_then(Value::as_bool) != Some(true)
        && v.get("phase").and_then(Value::as_str) == Some("focus"))
}


#[tauri::command]
pub fn work_preview_window(window: WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    if !cfg!(debug_assertions) || window.label() != "main" || !matches!(window.url().map_err(|e| e.to_string())?.path(), "/dev/work" | "/dev/timelapse") {
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
    let was_bad = is_active_bad(stored.as_ref());
    let bad = is_active_bad(value.as_ref());
    *stored = value.clone();
    drop(stored); // AppKit layout can synchronously issue a native callback.
    if was_visible != value.is_some() || (!was_bad && bad) {
        crate::overlay::window::set_work_widget(&app, value.is_some(), bad)?;
    }
    #[cfg(all(target_os = "macos", feature = "mac-app-store"))]
    {
        crate::overlay::window::restore_position(&app, 0, 0)?;
        crate::overlay::store_pet::update(&app, value)
    }
    #[cfg(not(all(target_os = "macos", feature = "mac-app-store")))]
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

// The overlay requests compaction after its recovery morph, never during growth.
#[tauri::command]
pub fn work_widget_compact(app: AppHandle, window: WebviewWindow, state: State<'_, WorkWidgetState>, session_id: String) -> Result<(), String> {
    if window.label() != "cat_overlay" { return Err("only widget can compact itself".into()); }
    let stored = state.0.lock().map_err(|e| e.to_string())?;
    if stored.as_ref().and_then(|v| v.get("sessionId")).and_then(Value::as_str) == Some(session_id.as_str())
        && !is_active_bad(stored.as_ref()) {
        crate::overlay::window::set_work_widget(&app, true, false)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_active_focus_can_enlarge() {
        for (phase, paused, expected) in [("focus", false, true), ("focus", true, false), ("rest", false, false), ("rest", true, false)] {
            assert_eq!(is_active_bad(Some(&json!({"bad":true,"phase":phase,"paused":paused}))), expected);
        }
        assert!(!is_active_bad(None));
        assert!(!is_active_bad(Some(&json!({"bad":false,"phase":"focus","paused":false}))));
    }
}
