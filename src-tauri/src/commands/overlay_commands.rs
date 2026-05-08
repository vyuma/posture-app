use tauri::{AppHandle, State};

use crate::overlay::state::{OverlayStateHandle, OverlayStateSnapshot};
use crate::overlay::window::{
    apply_mode_change, apply_position_offset, apply_posture_change, hide_character,
    open_main_window, show_character,
};

#[tauri::command]
pub fn overlay_set_mode(
    mode: String,
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<OverlayStateSnapshot, String> {
    apply_mode_change(&app, &state, &mode)
}

#[tauri::command]
pub fn overlay_get_state(state: State<'_, OverlayStateHandle>) -> OverlayStateSnapshot {
    state.snapshot()
}

#[tauri::command]
pub fn overlay_hide_character(
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<OverlayStateSnapshot, String> {
    hide_character(&app, &state)
}

#[tauri::command]
pub fn overlay_show_character(
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<OverlayStateSnapshot, String> {
    show_character(&app, &state)
}

#[tauri::command]
pub fn overlay_set_position_offset(
    offset_x: i32,
    offset_y: i32,
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<OverlayStateSnapshot, String> {
    apply_position_offset(&app, &state, offset_x, offset_y)
}

#[tauri::command]
pub fn overlay_reset_position_offset(
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<OverlayStateSnapshot, String> {
    apply_position_offset(&app, &state, 0, 0)
}

#[tauri::command]
pub fn overlay_open_main_window(app: AppHandle) -> Result<(), String> {
    open_main_window(&app)
}

#[tauri::command]
pub fn overlay_on_posture_change(
    is_bad: bool,
    app: AppHandle,
    state: State<'_, OverlayStateHandle>,
) -> Result<OverlayStateSnapshot, String> {
    apply_posture_change(&app, &state, is_bad)
}
