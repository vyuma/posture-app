//! Store-only public AppKit renderer. C callbacks carry no webview privilege.
use std::{cell::RefCell, ffi::{CStr, CString, c_char, c_void}, sync::OnceLock};
use objc2::{MainThreadMarker, rc::Retained};
use objc2_app_kit::NSView;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};
use crate::commands::work_widget_commands::WorkWidgetState;
static APP: OnceLock<AppHandle> = OnceLock::new();
thread_local! { static VIEW: RefCell<Option<Retained<NSView>>> = const { RefCell::new(None) }; }
extern "C" {
    fn piiin_pet_create(path: *const c_char, callback: extern "C" fn(*const c_char, *const c_char)) -> *mut NSView;
    fn piiin_pet_update(view: *mut c_void, json: *const c_char) -> bool;
}
pub fn create_view(app: &AppHandle, _mtm: MainThreadMarker) -> Result<Retained<NSView>, String> {
    if let Some(view) = VIEW.with(|v| v.borrow().clone()) { return Ok(view); }
    let _ = APP.set(app.clone());
    let resource = app.path().resource_dir().map_err(|e| e.to_string())?.join("native-pet/widget-states-v2.json");
    let path = if cfg!(debug_assertions) && !resource.is_file() {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/animations/anago/normal-nago/widget-states-v2.json")
    } else { resource };
    let path = CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    let view = unsafe { Retained::from_raw(piiin_pet_create(path.as_ptr(), callback)) }.ok_or("native pet initialization failed")?;
    VIEW.with(|v| *v.borrow_mut() = Some(view.clone()));
    Ok(view)
}
pub fn update(app: &AppHandle, value: Option<Value>) -> Result<(), String> {
    let json = value.map(|value| CString::new(value.to_string()).map_err(|e| e.to_string())).transpose()?;
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    let work = move || {
        let result = VIEW.with(|slot| {
            let view = slot.borrow();
            let view = view.as_ref().ok_or("native pet unavailable")?;
            let valid = unsafe { piiin_pet_update(Retained::as_ptr(view).cast_mut().cast(), json.as_ref().map_or(std::ptr::null(), |s| s.as_ptr())) };
            if valid { Ok(()) } else { Err("native pet rejected state") }
        }).map_err(str::to_string);
        let _ = send.send(result);
    };
    if MainThreadMarker::new().is_some() { work(); } else { app.run_on_main_thread(work).map_err(|e| e.to_string())?; }
    receive.recv().map_err(|e| e.to_string())?
}
extern "C" fn callback(action: *const c_char, session: *const c_char) {
    // Swift calls synchronously on AppKit's main thread; copy strings before returning.
    if action.is_null() || session.is_null() { return; }
    let action = unsafe { CStr::from_ptr(action) }.to_string_lossy().into_owned();
    let session = unsafe { CStr::from_ptr(session) }.to_string_lossy().into_owned();
    let Some(app) = APP.get() else { return };
    if let Err(error) = native_action(app, &action, &session) { eprintln!("native pet action failed: {error}"); }
}
fn native_action(app: &AppHandle, action: &str, session: &str) -> Result<(), String> {
    let state = app.state::<WorkWidgetState>();
    let stored = state.0.lock().map_err(|e| e.to_string())?;
    let value = stored.as_ref().ok_or("measurement finished")?;
    if value["sessionId"].as_str() != Some(session) { return Err("stale measurement".into()); }
    let bad = value["bad"] == true && value["phase"] == "focus" && value["paused"] != true;
    drop(stored);
    match action {
        "drag" => super::window::start_drag(app),
        "compact" => if !bad { super::window::set_work_widget(app, true, false) } else { Ok(()) },
        "open" | "finish" | "pause" | "resume" => {
            if matches!(action, "open" | "finish") { super::window::open_main_window(app)?; }
            app.emit_to("main", "work:action", json!({"sessionId":session,"action":action})).map_err(|e| e.to_string())
        },
        _ => Err("unknown native pet action".into())
    }
}
