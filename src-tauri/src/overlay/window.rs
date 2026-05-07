use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Position,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri::window::Color;

use super::state::{OverlayPhase, OverlayStateHandle};

const OVERLAY_LABEL: &str = "cat_overlay";
const OVERLAY_PAGE: &str = "overlay.html";
const OVERLAY_WIDTH: f64 = 280.0;
const OVERLAY_HEIGHT: f64 = 280.0;
const OVERLAY_MARGIN: i32 = 0;

#[derive(Clone, Serialize)]
struct OverlayPhasePayload {
    phase: &'static str,
}

pub fn ensure_overlay_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        return Ok(window);
    }

    let builder =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App(OVERLAY_PAGE.into()))
            .title("cat-overlay")
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

    let _ = window.set_ignore_cursor_events(true);

    position_window_bottom_right(&window)?;

    Ok(window)
}

pub fn apply_phase_change(
    app: &AppHandle,
    state: &OverlayStateHandle,
    is_bad_posture: bool,
) -> Result<(), String> {
    let Some(next_phase) = state.transition_for_posture(is_bad_posture) else {
        return Ok(());
    };

    let window = ensure_overlay_window(app)?;

    match next_phase {
        OverlayPhase::Entering | OverlayPhase::Idle | OverlayPhase::Exiting => {
            position_window_bottom_right(&window)?;
            window.show().map_err(|error| error.to_string())?;
        }
        OverlayPhase::Hidden => {
            let _ = window.hide();
        }
    }

    emit_phase(app, next_phase)
}

pub fn handle_animation_complete(
    app: &AppHandle,
    state: &OverlayStateHandle,
    completed_phase_name: &str,
) -> Result<(), String> {
    let completed_phase = OverlayPhase::from_str(completed_phase_name)
        .ok_or_else(|| format!("invalid phase: {completed_phase_name}"))?;

    let Some(next_phase) = state.transition_for_animation_complete(completed_phase) else {
        return Ok(());
    };

    let window = ensure_overlay_window(app)?;

    match next_phase {
        OverlayPhase::Hidden => {
            let _ = window.hide();
        }
        OverlayPhase::Entering | OverlayPhase::Idle | OverlayPhase::Exiting => {
            position_window_bottom_right(&window)?;
            window.show().map_err(|error| error.to_string())?;
        }
    }

    emit_phase(app, next_phase)
}

fn emit_phase(app: &AppHandle, phase: OverlayPhase) -> Result<(), String> {
    app.emit_to(
        OVERLAY_LABEL,
        "overlay:phase",
        OverlayPhasePayload {
            phase: phase.as_str(),
        },
    )
    .map_err(|error| error.to_string())
}

fn position_window_bottom_right(window: &WebviewWindow) -> Result<(), String> {
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

    let x = work_area.position.x + work_area.size.width as i32 - window_size.width as i32 - OVERLAY_MARGIN;
    let y = work_area.position.y + work_area.size.height as i32 - window_size.height as i32 - OVERLAY_MARGIN;

    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}
