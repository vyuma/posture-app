use tauri::State;

use crate::pairing::{
    broadcast_ws_state_event, AcquiredCharacterPayload, CharacterColorPayload,
    DesktopPairingStatus, PairingInfo, PairingStateHandle, PostureTimelineSegmentPayload,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmitAcquiredCharacterInput {
    measurement_id: String,
    acquired_at: String,
    character_id: String,
    character_name: String,
    rarity: String,
    active_measurement_ms: Option<u64>,
    good_ms: Option<u64>,
    good_ratio: Option<f64>,
    posture_timeline: Option<Vec<PostureTimelineSegmentPayload>>,
    story: Option<String>,
    portrait_src: Option<String>,
    personality_tags: Option<Vec<String>>,
    character_color: Option<CharacterColorPayload>,
    tone_class: Option<String>,
}

#[tauri::command]
pub fn get_pairing_info(state: State<'_, PairingStateHandle>) -> PairingInfo {
    state.get_pairing_info()
}

#[tauri::command]
pub fn get_pairing_status(state: State<'_, PairingStateHandle>) -> DesktopPairingStatus {
    let mut status = state.get_pairing_status();
    status.ws_client_count = crate::pairing::ws_connected_client_count();
    status
}

#[tauri::command]
pub fn sync_pairing_measuring_session(
    active: bool,
    state: State<'_, PairingStateHandle>,
) {
    state.set_measuring_session_active(active);
    state.mark_posture_signal();
    let event_type = if active {
        "measuring_started"
    } else {
        "measuring_stopped"
    };
    broadcast_ws_state_event(&state, event_type);
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

#[tauri::command]
pub fn emit_acquired_characters_cleared(state: State<'_, PairingStateHandle>) {
    state.clear_pending_acquired_events();
    state.bump_sequence();
    broadcast_ws_state_event(&state, "acquired_characters_cleared");
}

#[tauri::command]
pub fn emit_acquired_character_event(
    input: EmitAcquiredCharacterInput,
    state: State<'_, PairingStateHandle>,
) {
    let payload = AcquiredCharacterPayload {
        measurement_id: input.measurement_id,
        acquired_at: input.acquired_at,
        character_id: input.character_id,
        character_name: input.character_name,
        rarity: input.rarity,
        active_measurement_ms: input.active_measurement_ms,
        good_ms: input.good_ms,
        good_ratio: input.good_ratio,
        posture_timeline: input.posture_timeline,
        story: input.story,
        portrait_src: input.portrait_src,
        personality_tags: input.personality_tags,
        character_color: input.character_color,
        tone_class: input.tone_class,
    };
    crate::pairing::broadcast_ws_acquired_event(&state, payload);
}
