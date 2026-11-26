use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use super::state::{OverlayMode, OverlayStateHandle, OverlayStateSnapshot};

const MAIN_WINDOW_LABEL: &str = "main";
const OVERLAY_LABEL: &str = "cat_overlay";
const OVERLAY_PAGE: &str = "overlay.html";
const OVERLAY_WIDTH: f64 = 220.0;
const OVERLAY_HEIGHT: f64 = 238.0;

/// Expand around the timer's bottom-center, keeping its screen anchor stable.
pub fn set_work_widget(app: &AppHandle, visible: bool, bad: bool) -> Result<(), String> {
    let window = ensure_overlay_window(app)?;
    // Transparent padding lets the character shadow fade beyond the clipped artwork.
    let (width, height): (f64, f64) = if bad { (400.0, 870.0) } else { (300.0, 324.0) };
    #[cfg(target_os = "macos")]
    {
        let _ = window;
        super::native_macos::resize_work_widget(app, width, height)?;
        super::native_macos::set_visible(app, visible)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let old = window.outer_size().map_err(|e| e.to_string())?;
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let area = window.current_monitor().map_err(|e| e.to_string())?.map(|monitor| *monitor.work_area());
        let width = area.map_or(width, |area| width.min(area.size.width as f64 / scale));
        let height = area.map_or(height, |area| height.min(area.size.height as f64 / scale));
        let mut x = position.x + (old.width as i32 - (width * scale) as i32) / 2;
        let mut y = position.y + old.height as i32 - (height * scale) as i32;
        if let Some(area) = area {
            x = x.clamp(area.position.x, (area.position.x + area.size.width as i32 - (width * scale) as i32).max(area.position.x));
            y = y.clamp(area.position.y, (area.position.y + area.size.height as i32 - (height * scale) as i32).max(area.position.y));
        }
        // Windows must move and resize atomically: separate calls expose a frame
        // with the new viewport at the old origin, making the pet jump vertically.
        #[cfg(target_os = "windows")]
        {
            #[link(name = "user32")]
            extern "system" {
                fn SetWindowPos(hwnd: *mut std::ffi::c_void, after: *mut std::ffi::c_void,
                    x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
            }
            let hwnd = window.hwnd().map_err(|e| e.to_string())?;
            // SWP_NOZORDER | SWP_NOACTIVATE preserves focus and topmost state.
            let ok = unsafe { SetWindowPos(hwnd.0 as _, std::ptr::null_mut(), x, y,
                (width * scale).round() as i32, (height * scale).round() as i32, 0x0014) };
            if ok == 0 { return Err(std::io::Error::last_os_error().to_string()); }
        }
        #[cfg(not(target_os = "windows"))]
        {
            window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
            window.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        }
        if visible { window.show() } else { window.hide() }.map_err(|e| e.to_string())
    }
}
pub(super) const OVERLAY_MARGIN_X: i32 = 22;
#[cfg(not(target_os = "macos"))]
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

    #[cfg(not(all(target_os = "macos", feature = "mac-app-store")))]
    let builder = builder.transparent(true);
    #[cfg(all(target_os = "macos", feature = "mac-app-store"))]
    let builder = builder.background_color(Color(255, 255, 255, 255));

    let window = builder.build().map_err(|error| error.to_string())?;

    let _ = window.set_ignore_cursor_events(false);
    #[cfg(target_os = "macos")]
    super::native_macos::create(&window)?;

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
    #[cfg(not(target_os = "macos"))]
    let app_handle = app.clone();
    #[cfg(not(target_os = "macos"))]
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(position) = event {
            if ready.load(Ordering::Acquire) {
                let _ = app_handle.emit("overlay:dragged", ());
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

    #[cfg(target_os = "macos")]
    super::native_macos::set_visible(app, snapshot.is_visible())?;
    #[cfg(not(target_os = "macos"))]
    if snapshot.is_visible() {
        if !window.is_visible().map_err(|error| error.to_string())? {
            window.show().map_err(|error| error.to_string())?;
        }
    } else {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = window; // The Tauri host stays hidden; only the native panel is shown.

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
    save_position(app, overlay_position(&window)?)?;
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

pub(super) fn save_position(
    app: &AppHandle,
    position: PhysicalPosition<i32>,
) -> Result<(), String> {
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
        let position = PhysicalPosition::new(position.x, position.y);
        #[cfg(target_os = "macos")]
        super::native_macos::set_position(app, position)?;
        #[cfg(not(target_os = "macos"))]
        window
            .set_position(position)
            .map_err(|error| error.to_string())?;
    } else {
        let snapshot = app
            .state::<OverlayStateHandle>()
            .set_position_offset(offset_x, offset_y);
        position_window_bottom_right(&window, snapshot)?;
    }
    save_position(app, overlay_position(&window)?)?;
    ready.0.store(true, Ordering::Release);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
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
        .set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn position_window_bottom_right(
    window: &WebviewWindow,
    snapshot: OverlayStateSnapshot,
) -> Result<(), String> {
    super::native_macos::position_bottom_right(
        window.app_handle(),
        snapshot.offset_x,
        snapshot.offset_y,
    )
}

fn overlay_position(window: &WebviewWindow) -> Result<PhysicalPosition<i32>, String> {
    #[cfg(target_os = "macos")]
    return super::native_macos::position(window.app_handle());
    #[cfg(not(target_os = "macos"))]
    window.outer_position().map_err(|error| error.to_string())
}

pub fn start_drag(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return super::native_macos::start_drag(app);
    #[cfg(not(target_os = "macos"))]
    ensure_overlay_window(app)?
        .start_dragging()
        .map_err(|error| error.to_string())
}
