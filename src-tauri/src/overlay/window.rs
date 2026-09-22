use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Position, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use super::state::{OverlayMode, OverlayStateHandle, OverlayStateSnapshot};

const MAIN_WINDOW_LABEL: &str = "main";
const OVERLAY_LABEL: &str = "cat_overlay";
const OVERLAY_PAGE: &str = "overlay.html";
const OVERLAY_WIDTH: f64 = 220.0;
const OVERLAY_HEIGHT: f64 = 238.0;
const OVERLAY_MARGIN_X: i32 = 22;
const OVERLAY_MARGIN_Y: i32 = 0;

pub fn ensure_overlay_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        return Ok(window);
    }

    let builder =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App(OVERLAY_PAGE.into()))
            .title("character-overlay")
            .decorations(false)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .visible(false)
            .focused(false)
            .background_color(Color(0, 0, 0, 0))
            .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT);

    let builder = builder.transparent(true);

    let window = builder.build().map_err(|error| error.to_string())?;

    let _ = window.set_ignore_cursor_events(false);
    #[cfg(target_os = "macos")]
    {
        let overlay = window.clone();
        window
            .run_on_main_thread(move || {
                if let Ok(pointer) = overlay.ns_window() {
                    // Tauri owns this NSWindow; AppKit access stays on the main thread.
                    let native = unsafe { &*pointer.cast::<objc2_app_kit::NSWindow>() };
                    use objc2_app_kit::NSWindowCollectionBehavior as Behavior;
                    let mut behavior = native.collectionBehavior();
                    behavior.remove(Behavior::FullScreenPrimary | Behavior::FullScreenNone);
                    behavior.insert(Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary);
                    // FullScreenAuxiliary alone describes this app's full-screen windows.
                    // macOS 13+ explicitly supports joining other apps' full-screen Spaces.
                    if objc2::available!(macos = 13.0) {
                        behavior.remove(Behavior::Primary | Behavior::Auxiliary);
                        behavior.insert(Behavior::CanJoinAllApplications);
                    }
                    native.setCollectionBehavior(behavior);
                }
            })
            .map_err(|error| error.to_string())?;
    }

    position_window_bottom_right(
        &window,
        OverlayStateSnapshot {
            mode: OverlayMode::Hidden.as_str(),
            user_hidden: false,
            offset_x: 0,
            offset_y: 0,
        },
    )?;

    let ready = Arc::new(AtomicBool::new(false));
    app.manage(PlacementReady(ready.clone()));
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(position) = event {
            if ready.load(Ordering::Acquire) {
                if let Err(error) = save_position(&app_handle, *position) {
                    eprintln!("failed to save pet position: {error}");
                }
            }
        }
    });
    Ok(window)
}

pub fn apply_mode_change(
    app: &AppHandle,
    state: &OverlayStateHandle,
    mode_name: &str,
) -> Result<OverlayStateSnapshot, String> {
    let mode = OverlayMode::from_str(mode_name)
        .ok_or_else(|| format!("invalid overlay mode: {mode_name}"))?;
    let snapshot = state.set_mode(mode);
    apply_snapshot(app, snapshot)?;
    emit_state(app, snapshot)?;
    Ok(snapshot)
}

pub fn apply_posture_change(
    app: &AppHandle,
    state: &OverlayStateHandle,
    is_bad_posture: bool,
) -> Result<OverlayStateSnapshot, String> {
    apply_mode_change(app, state, if is_bad_posture { "bad" } else { "good" })
}

pub fn hide_character(
    app: &AppHandle,
    state: &OverlayStateHandle,
) -> Result<OverlayStateSnapshot, String> {
    let snapshot = state.set_user_hidden(true);
    apply_snapshot(app, snapshot)?;
    emit_state(app, snapshot)?;
    Ok(snapshot)
}

pub fn show_character(
    app: &AppHandle,
    state: &OverlayStateHandle,
) -> Result<OverlayStateSnapshot, String> {
    let snapshot = state.set_user_hidden(false);
    apply_snapshot(app, snapshot)?;
    emit_state(app, snapshot)?;
    Ok(snapshot)
}

pub fn open_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window not found".to_string())?;

    window.show().map_err(|error| error.to_string())?;
    let _ = window.unminimize();
    window.set_focus().map_err(|error| error.to_string())
}

fn apply_snapshot(app: &AppHandle, snapshot: OverlayStateSnapshot) -> Result<(), String> {
    let window = ensure_overlay_window(app)?;

    if snapshot.is_visible() {
        if !window.is_visible().map_err(|error| error.to_string())? {
            window.show().map_err(|error| error.to_string())?;
        }
    } else {
        let _ = window.hide();
    }

    Ok(())
}

fn emit_state(app: &AppHandle, snapshot: OverlayStateSnapshot) -> Result<(), String> {
    app.emit("overlay:state", snapshot)
        .map_err(|error| error.to_string())
}

pub fn apply_position_offset(
    app: &AppHandle,
    state: &OverlayStateHandle,
    offset_x: i32,
    offset_y: i32,
) -> Result<OverlayStateSnapshot, String> {
    let snapshot = state.set_position_offset(offset_x, offset_y);
    let window = ensure_overlay_window(app)?;
    position_window_bottom_right(&window, snapshot)?;
    save_position(
        app,
        window.outer_position().map_err(|error| error.to_string())?,
    )?;
    emit_state(app, snapshot)?;
    Ok(snapshot)
}

struct PlacementReady(Arc<AtomicBool>);

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct SavedPosition {
    x: i32,
    y: i32,
}

fn position_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("pet-position-v2.json"))
}

fn save_position(app: &AppHandle, position: PhysicalPosition<i32>) -> Result<(), String> {
    let path = position_path(app)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|error| error.to_string())?;
    let bytes = serde_json::to_vec(&SavedPosition {
        x: position.x,
        y: position.y,
    })
    .map_err(|error| error.to_string())?;
    std::fs::write(path, bytes).map_err(|error| error.to_string())
}

// Called once by the overlay after it has read the old localStorage offsets.
// A v2 absolute coordinate always takes precedence over those legacy offsets.
pub fn restore_position(app: &AppHandle, offset_x: i32, offset_y: i32) -> Result<(), String> {
    let window = ensure_overlay_window(app)?;
    let ready = app.state::<PlacementReady>();
    if ready.0.load(Ordering::Acquire) {
        return Ok(());
    }
    let path = position_path(app)?;
    let saved = std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<SavedPosition>(&bytes).ok());
    if let Some(position) = saved {
        window
            .set_position(PhysicalPosition::new(position.x, position.y))
            .map_err(|error| error.to_string())?;
    } else {
        let snapshot = app
            .state::<OverlayStateHandle>()
            .set_position_offset(offset_x, offset_y);
        position_window_bottom_right(&window, snapshot)?;
    }
    save_position(
        app,
        window.outer_position().map_err(|error| error.to_string())?,
    )?;
    ready.0.store(true, Ordering::Release);
    Ok(())
}

fn position_window_bottom_right(
    window: &WebviewWindow,
    snapshot: OverlayStateSnapshot,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| {
            window
                .app_handle()
                .primary_monitor()
                .map_err(|error| error.to_string())
                .ok()
                .flatten()
        })
        .ok_or_else(|| "no monitor available".to_string())?;

    let work_area = monitor.work_area();
    let window_size = window.outer_size().map_err(|error| error.to_string())?;

    let x = work_area.position.x + work_area.size.width as i32
        - window_size.width as i32
        - OVERLAY_MARGIN_X
        + snapshot.offset_x;
    let y = work_area.position.y + work_area.size.height as i32
        - window_size.height as i32
        - OVERLAY_MARGIN_Y
        + snapshot.offset_y;

    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}
