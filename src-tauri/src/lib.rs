mod commands;
mod pairing;
use commands::pairing_commands::{
    emit_posture_signal, get_pairing_info, get_pairing_status,
};
use pairing::{start_pairing_server, PairingStateHandle};
mod overlay;
use commands::overlay_commands::{
    overlay_get_phase, overlay_on_animation_complete, overlay_on_posture_change,
};
use overlay::state::OverlayStateHandle;
use overlay::window::ensure_overlay_window;
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pairing_state = PairingStateHandle::new();
    let overlay_state = OverlayStateHandle::new();

    start_pairing_server(pairing_state.clone())
        .expect("failed to start desktop pairing server");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(pairing_state)
        .manage(overlay_state)
        .setup(|app| {
            if let Err(error) = ensure_overlay_window(app.handle()) {
                eprintln!("failed to initialize cat overlay window: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_pairing_info,
            get_pairing_status,
            emit_posture_signal,
            overlay_on_posture_change,
            overlay_on_animation_complete,
            overlay_get_phase
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
