use tauri::State;

use crate::pairing::{
    broadcast_ws_state_event, DesktopPairingStatus, PairingInfo, PairingStateHandle,
};

#[tauri::command]
pub fn get_pairing_info(state: State<'_, PairingStateHandle>) -> PairingInfo {
    state.get_pairing_info()
}

#[tauri::command]
pub fn get_pairing_status(state: State<'_, PairingStateHandle>) -> DesktopPairingStatus {
    state.get_pairing_status()
}

#[tauri::command]
pub fn emit_posture_signal(
    is_bad: bool,
    state: State<'_, PairingStateHandle>,
) {
    let event_type = if is_bad { "posture_bad" } else { "posture_good" };
    state.mark_posture_signal();
    broadcast_ws_state_event(&state, event_type);
}
