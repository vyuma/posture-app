mod commands;
mod overlay;
mod pairing;

use commands::clipboard_commands::copy_share_image_to_clipboard;
use commands::overlay_commands::{
    overlay_get_state, overlay_hide_character, overlay_on_posture_change, overlay_open_main_window,
    overlay_reset_position_offset, overlay_set_mode, overlay_set_position_offset,
    overlay_show_character,
};
use commands::pairing_commands::{
    disconnect_pairing_device, emit_acquired_character_event, emit_acquired_characters_cleared,
    emit_posture_signal, get_pairing_info, get_pairing_status,
    sync_pairing_good_posture_registration, sync_pairing_measuring_session,
};
use overlay::state::OverlayStateHandle;
use overlay::window::ensure_overlay_window;
use pairing::{start_pairing_server, PairingStateHandle};
use tauri::{LogicalSize, Manager, WebviewWindow};

const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_INITIAL_WIDTH: f64 = 1000.0;
const MAIN_INITIAL_HEIGHT: f64 = 700.0;
const MAIN_MIN_WIDTH: f64 = 720.0;
const MAIN_MIN_HEIGHT: f64 = 540.0;
const MAIN_MAX_WORK_AREA_WIDTH_RATIO: f64 = 0.82;
const MAIN_MAX_WORK_AREA_HEIGHT_RATIO: f64 = 0.8;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pairing_state = PairingStateHandle::new();
    let overlay_state = OverlayStateHandle::new();

    start_pairing_server(pairing_state.clone()).expect("failed to start desktop pairing server");

    tauri::Builder::default()
        .manage(pairing_state)
        .manage(overlay_state)
        .setup(|app| {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if let Err(error) = fit_main_window_to_monitor(&window) {
                    eprintln!("failed to fit main window to monitor: {error}");
                }
            }

            if let Err(error) = ensure_overlay_window(&app.handle()) {
                eprintln!("failed to initialize cat overlay window: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_pairing_info,
            get_pairing_status,
            disconnect_pairing_device,
            emit_posture_signal,
            emit_acquired_character_event,
            emit_acquired_characters_cleared,
            sync_pairing_measuring_session,
            sync_pairing_good_posture_registration,
            overlay_set_mode,
            overlay_get_state,
            overlay_hide_character,
            overlay_show_character,
            overlay_set_position_offset,
            overlay_reset_position_offset,
            overlay_open_main_window,
            overlay_on_posture_change,
            copy_share_image_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn fit_main_window_to_monitor(window: &WebviewWindow) -> Result<(), String> {
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
        });

    let Some(monitor) = monitor else {
        return Ok(());
    };

    let work_area = monitor.work_area();
    let scale_factor = monitor.scale_factor();
    let work_width = work_area.size.width as f64 / scale_factor;
    let work_height = work_area.size.height as f64 / scale_factor;

    let width = MAIN_INITIAL_WIDTH
        .min(work_width * MAIN_MAX_WORK_AREA_WIDTH_RATIO)
        .max(MAIN_MIN_WIDTH);
    let height = MAIN_INITIAL_HEIGHT
        .min(work_height * MAIN_MAX_WORK_AREA_HEIGHT_RATIO)
        .max(MAIN_MIN_HEIGHT);

    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    window.center().map_err(|error| error.to_string())
}
