use tauri::State;

use crate::pairing::{
    broadcast_ws_state_event, AcquiredCharacterPayload, CharacterColorPayload,
    DesktopPairingStatus, PairingInfo, PairingStateHandle,
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
    active_measurement_ms: Option<f64>,
    good_ms: Option<f64>,
    good_ratio: Option<f64>,
    posture_timeline: Option<Vec<crate::pairing::PostureTimelineSegmentPayload>>,
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
pub fn disconnect_pairing_device(state: State<'_, PairingStateHandle>) -> DesktopPairingStatus {
    state.disconnect_device();
    broadcast_ws_state_event(&state, "disconnected");
    crate::pairing::disconnect_ws_clients();

    let mut status = state.get_pairing_status();
    status.ws_client_count = crate::pairing::ws_connected_client_count();
    status
}

#[tauri::command]
pub fn sync_pairing_measuring_session(
    active: bool,
    measurement_id: Option<String>,
    state: State<'_, PairingStateHandle>,
) {
    state.set_measurement_id(measurement_id);
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
pub fn sync_pairing_good_posture_registration(active: bool, state: State<'_, PairingStateHandle>) {
    state.set_good_posture_registration_active(active);
    state.mark_posture_signal();
    let event_type = if active {
        "good_posture_registration_started"
    } else {
        "good_posture_registration_stopped"
    };
    broadcast_ws_state_event(&state, event_type);
}

#[tauri::command]
pub fn emit_posture_signal(is_bad: bool, state: State<'_, PairingStateHandle>) {
    state.set_posture(is_bad);
    let event_type = if is_bad {
        "posture_bad"
    } else {
        "posture_good"
    };
    state.mark_posture_signal();
    broadcast_ws_state_event(&state, event_type);
}

#[tauri::command]
pub fn emit_acquired_characters_cleared(reset: crate::pairing::CollectionReset, state: State<'_, PairingStateHandle>) {
    crate::pairing::broadcast_ws_collection_reset(&state, reset);
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

#[tauri::command]
pub fn emit_completed_measurement(
    result: crate::pairing::CompletedMeasurement,
    state: State<'_, PairingStateHandle>,
) {
    crate::pairing::broadcast_ws_completed_event(&state, result);
}
