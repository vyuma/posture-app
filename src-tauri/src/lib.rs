mod commands;
#[cfg(desktop)]
mod main_window;
mod overlay;
mod pairing;
#[cfg(all(target_os = "macos", feature = "direct-distribution"))]
mod updates;

use commands::clipboard_commands::copy_share_image_to_clipboard;
use commands::overlay_commands::{
    overlay_get_state, overlay_hide_character, overlay_on_posture_change, overlay_open_main_window,
    overlay_restore_position, overlay_reset_position_offset, overlay_set_mode, overlay_set_position_offset,
    overlay_show_character, overlay_start_drag,
};
use commands::pairing_commands::{emit_completed_measurement, emit_posture_signal, get_pairing_info, get_pairing_status, sync_pairing_measuring_session, sync_pairing_good_posture_registration, emit_acquired_character_event, emit_acquired_characters_cleared, disconnect_pairing_device};
use overlay::state::OverlayStateHandle;
use overlay::window::ensure_overlay_window;
use pairing::PairingStateHandle;
#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pairing_state = PairingStateHandle::new();
    let overlay_state = OverlayStateHandle::new();

    // Pairing is dormant. Reintroducing it requires an explicit product entry point.

    tauri::Builder::default()
        .manage(pairing_state)
        .manage(overlay_state)
        .manage(commands::work_widget_commands::WorkWidgetState::default())
        .setup(|app| {
            #[cfg(all(target_os = "macos", feature = "direct-distribution"))]
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
            commands::work_commands::work_database,
            commands::timelapse_commands::timelapse_store,
            commands::work_widget_commands::work_widget_update,
            commands::work_widget_commands::work_widget_get,
            commands::work_widget_commands::work_widget_compact,
            commands::work_widget_commands::work_preview_window,
            commands::work_widget_commands::work_widget_action,
            get_pairing_info,
            get_pairing_status,
            emit_completed_measurement,
            emit_posture_signal,
            sync_pairing_measuring_session,
            sync_pairing_good_posture_registration,
            emit_acquired_character_event,
            emit_acquired_characters_cleared,
            disconnect_pairing_device,
            overlay_set_mode,
            overlay_get_state,
            overlay_hide_character,
            overlay_show_character,
            overlay_start_drag,
            overlay_restore_position,
            overlay_set_position_offset,
            overlay_reset_position_offset,
            overlay_open_main_window,
            overlay_on_posture_change,
            copy_share_image_to_clipboard,
            commands::result_image_commands::save_result_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
