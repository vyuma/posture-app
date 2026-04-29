use tauri::{AppHandle, State};

use crate::overlay::state::OverlayStateHandle;
use crate::overlay::window::{apply_phase_change, handle_animation_complete};

#[tauri::command]
pub fn overlay_on_posture_change(
    is_bad: bool,
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<(), String> {
    apply_phase_change(&app, &state, is_bad)
}

#[tauri::command]
pub fn overlay_on_animation_complete(
    phase: String,
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<(), String> {
    handle_animation_complete(&app, &state, &phase)
}

#[tauri::command]
pub fn overlay_get_phase(state: State<'_, OverlayStateHandle>) -> String {
    state.phase_name().to_string()
}
