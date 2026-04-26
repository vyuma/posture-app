mod commands;
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
    let overlay_state = OverlayStateHandle::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(overlay_state)
        .setup(|app| {
            if let Err(error) = ensure_overlay_window(app.handle()) {
                eprintln!("failed to initialize cat overlay window: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            overlay_on_posture_change,
            overlay_on_animation_complete,
            overlay_get_phase
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
