use tauri::State;

use crate::pairing::{
    DesktopPairingStatus, PairingInfo, PairingStateHandle, VibrationPattern,
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
pub fn trigger_mobile_vibration(
    pattern: String,
    state: State<'_, PairingStateHandle>,
) -> Result<(), String> {
    let parsed_pattern = VibrationPattern::try_from(pattern.as_str())?;
    state.trigger_vibration(parsed_pattern);
    Ok(())
}
