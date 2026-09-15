mod commands;
#[cfg(desktop)]
mod main_window;
mod overlay;
mod pairing;
#[cfg(target_os = "macos")]
mod updates;

use commands::clipboard_commands::copy_share_image_to_clipboard;
use commands::overlay_commands::{
    overlay_get_state, overlay_hide_character, overlay_on_posture_change, overlay_open_main_window,
    overlay_reset_position_offset, overlay_set_mode, overlay_set_position_offset,
    overlay_show_character,
};
use commands::pairing_commands::{emit_posture_signal, get_pairing_info, get_pairing_status};
use overlay::state::OverlayStateHandle;
use overlay::window::ensure_overlay_window;
use pairing::{start_pairing_server, PairingStateHandle};
#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pairing_state = PairingStateHandle::new();
    let overlay_state = OverlayStateHandle::new();

    start_pairing_server(pairing_state.clone()).expect("failed to start desktop pairing server");

    tauri::Builder::default()
        .manage(pairing_state)
        .manage(overlay_state)
        .setup(|app| {
            #[cfg(target_os = "macos")]
            updates::setup(app)?;
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = main_window::fit_initial_window(&window) {
                    eprintln!("failed to fit main window to display: {error}");
                }
                // Show only after fitting, so small displays do not flash an oversized window.
                window.show()?;
            }
            if let Err(error) = ensure_overlay_window(&app.handle()) {
                eprintln!("failed to initialize cat overlay window: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_pairing_info,
            get_pairing_status,
            emit_posture_signal,
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
