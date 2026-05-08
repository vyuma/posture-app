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
        let _ = window.set_ignore_cursor_events(false);
        return Ok(window);
    }

    let builder =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App(OVERLAY_PAGE.into()))
            .title("character-overlay")
            .decorations(false)
            .always_on_top(true)
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

    position_window_bottom_right(
        &window,
        OverlayStateSnapshot {
            mode: OverlayMode::Hidden.as_str(),
            user_hidden: false,
            offset_x: 0,
            offset_y: 0,
        },
    )?;

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
        position_window_bottom_right(&window, snapshot)?;
        window.show().map_err(|error| error.to_string())?;
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
    emit_state(app, snapshot)?;
    Ok(snapshot)
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
