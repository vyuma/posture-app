mod commands;
mod pairing;

use commands::pairing_commands::{
    emit_posture_signal, get_pairing_info, get_pairing_status,
};
use pairing::{start_pairing_server, PairingStateHandle};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pairing_state = PairingStateHandle::new();

    start_pairing_server(pairing_state.clone())
        .expect("failed to start desktop pairing server");

    tauri::Builder::default()
        .manage(pairing_state)
        .invoke_handler(tauri::generate_handler![
            get_pairing_info,
            get_pairing_status,
            emit_posture_signal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
