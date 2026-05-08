use std::{
    net::{IpAddr, UdpSocket},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::types::{DesktopPairingStatus, PairingInfo};

#[derive(Clone)]
pub struct PairingStateHandle {
    inner: Arc<Mutex<PairingState>>,
}

#[derive(Clone)]
struct PairingState {
    host: String,
    port: u16,
    token: String,
    paired: bool,
    device_name: Option<String>,
    last_seen_at: Option<String>,
    last_sequence: u64,
    /// PC フローが measuring の間 true（スマホ側の「測定中」表示と同期）
    measuring_session_active: bool,
    pending_acks: HashMap<String, PendingAckRecord>,
}

#[derive(Clone)]
struct PendingAckRecord {
    event_id: String,
    sequence: u64,
    payload: AcquiredCharacterPayload,
    sent_count: u32,
    last_sent_at: Option<String>,
    created_at: String,
    failed_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    ok: bool,
    server_time: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResponse {
    ok: bool,
    paired: bool,
    device_name: String,
    paired_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectResponse {
    ok: bool,
    paired: bool,
    disconnected_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    ok: bool,
    error_code: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsEvent {
    r#type: String,
    sequence: u64,
    paired: bool,
    device_name: Option<String>,
    last_seen_at: Option<String>,
    created_at: String,
    measuring_session_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostureTimelineSegmentPayload {
    pub start_ms: f64,
    pub end_ms: f64,
    pub is_good: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterColorPayload {
    pub primary: String,
    pub soft: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcquiredCharacterPayload {
    pub measurement_id: String,
    pub acquired_at: String,
    pub character_id: String,
    pub character_name: String,
    pub rarity: String,
    pub active_measurement_ms: Option<u64>,
    pub good_ms: Option<u64>,
    pub good_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub posture_timeline: Option<Vec<PostureTimelineSegmentPayload>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub story: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub portrait_src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub personality_tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_color: Option<CharacterColorPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tone_class: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReliableWsEvent {
    r#type: String,
    pub event_id: String,
    sequence: u64,
    requires_ack: bool,
    paired: bool,
    device_name: Option<String>,
    last_seen_at: Option<String>,
    created_at: String,
    measuring_session_active: bool,
    payload: AcquiredCharacterPayload,
}

impl PairingStateHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PairingState {
                host: local_ip_address(),
                port: 0,
                token: generate_token(),
                paired: false,
                device_name: None,
                last_seen_at: None,
                last_sequence: 0,
                measuring_session_active: false,
                pending_acks: HashMap::new(),
            })),
        }
    }

    pub fn set_port(&self, port: u16) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.port = port;
    }

    pub fn get_pairing_info(&self) -> PairingInfo {
        let state = self.inner.lock().expect("pairing state poisoned");

        PairingInfo {
            host: state.host.clone(),
            port: state.port,
            token: state.token.clone(),
        }
    }

    pub fn get_pairing_status(&self) -> DesktopPairingStatus {
        let state = self.inner.lock().expect("pairing state poisoned");

        DesktopPairingStatus {
            paired: state.paired,
            device_name: state.device_name.clone(),
            last_seen_at: state.last_seen_at.clone(),
            ws_client_count: 0,
        }
    }

    /// 診断・将来コマンド用（WS 切断時はペア状態を維持するため server 側では未使用）
    #[allow(dead_code)]
    pub fn is_paired(&self) -> bool {
        self.inner.lock().expect("pairing state poisoned").paired
    }

    pub fn matches_token(&self, token: &str) -> bool {
        let state = self.inner.lock().expect("pairing state poisoned");
        state.token == token
    }

    pub fn pair_device(&self, device_name: String) -> PairResponse {
        let now = timestamp_string();
        let mut state = self.inner.lock().expect("pairing state poisoned");

        state.paired = true;
        state.device_name = Some(device_name.clone());
        state.last_seen_at = Some(now.clone());
        state.last_sequence += 1;

        PairResponse {
            ok: true,
            paired: true,
            device_name,
            paired_at: now,
        }
    }

    pub fn disconnect_device(&self) -> DisconnectResponse {
        let now = timestamp_string();
        let mut state = self.inner.lock().expect("pairing state poisoned");

        state.paired = false;
        state.device_name = None;
        state.last_seen_at = None;
        state.last_sequence += 1;

        DisconnectResponse {
            ok: true,
            paired: false,
            disconnected_at: now,
        }
    }

    pub fn mark_posture_signal(&self) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.last_sequence += 1;
    }

    pub fn set_measuring_session_active(&self, active: bool) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.measuring_session_active = active;
    }

    pub fn create_acquired_event(
        &self,
        payload: AcquiredCharacterPayload,
    ) -> ReliableWsEvent {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.last_sequence += 1;
        let sequence = state.last_sequence;
        let created_at = timestamp_string();
        let event_id = format!("evt-{}-{}", created_at, sequence);
        let measuring_session_active = state.measuring_session_active;
        let event = ReliableWsEvent {
            r#type: "acquired_character".to_string(),
            event_id: event_id.clone(),
            sequence,
            requires_ack: true,
            paired: state.paired,
            device_name: state.device_name.clone(),
            last_seen_at: state.last_seen_at.clone(),
            created_at: created_at.clone(),
            measuring_session_active,
            payload: payload.clone(),
        };
        state.pending_acks.insert(
            event_id.clone(),
            PendingAckRecord {
                event_id,
                sequence,
                payload,
                sent_count: 0,
                last_sent_at: None,
                created_at,
                failed_at: None,
            },
        );
        event
    }

    pub fn mark_acquired_event_sent(&self, event_id: &str) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        if let Some(record) = state.pending_acks.get_mut(event_id) {
            record.sent_count = record.sent_count.saturating_add(1);
            record.last_sent_at = Some(timestamp_string());
            record.failed_at = None;
        }
    }

    pub fn ack_event(&self, event_id: &str, sequence: u64) -> bool {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        match state.pending_acks.get(event_id) {
            Some(record) if record.sequence == sequence => {
                state.pending_acks.remove(event_id);
                true
            }
            _ => false,
        }
    }

    pub fn build_pending_resend_events(&self) -> Vec<ReliableWsEvent> {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        let paired = state.paired;
        let device_name = state.device_name.clone();
        let last_seen_at = state.last_seen_at.clone();
        let mut records: Vec<PendingAckRecord> = state.pending_acks.values().cloned().collect();
        records.sort_by_key(|record| record.sequence);

        records
            .iter()
            .map(|record| {
                if let Some(pending) = state.pending_acks.get_mut(&record.event_id) {
                    pending.sent_count = pending.sent_count.saturating_add(1);
                    pending.last_sent_at = Some(timestamp_string());
                    pending.failed_at = None;
                }
                ReliableWsEvent {
                    r#type: "acquired_character".to_string(),
                    event_id: record.event_id.clone(),
                    sequence: record.sequence,
                    requires_ack: true,
                    paired,
                    device_name: device_name.clone(),
                    last_seen_at: last_seen_at.clone(),
                    created_at: record.created_at.clone(),
                    measuring_session_active: state.measuring_session_active,
                    payload: record.payload.clone(),
                }
            })
            .collect()
    }

    pub fn build_retry_due_events(
        &self,
        now_epoch_sec: u64,
        ack_timeout_sec: u64,
        max_retry: u32,
    ) -> Vec<ReliableWsEvent> {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        let paired = state.paired;
        let device_name = state.device_name.clone();
        let last_seen_at = state.last_seen_at.clone();
        let measuring_session_active = state.measuring_session_active;
        let mut records: Vec<PendingAckRecord> = state.pending_acks.values().cloned().collect();
        records.sort_by_key(|record| record.sequence);

        let now = now_epoch_sec.to_string();
        let mut due_events = Vec::new();

        for record in records {
            let should_retry = match &record.last_sent_at {
                Some(last_sent) => {
                    let last_epoch = last_sent.parse::<u64>().unwrap_or_default();
                    now_epoch_sec.saturating_sub(last_epoch) >= ack_timeout_sec
                }
                None => true,
            };
            if !should_retry {
                continue;
            }
            if record.sent_count >= max_retry {
                if let Some(pending) = state.pending_acks.get_mut(&record.event_id) {
                    if pending.failed_at.is_none() {
                        pending.failed_at = Some(now.clone());
                    }
                }
                continue;
            }
            if let Some(pending) = state.pending_acks.get_mut(&record.event_id) {
                pending.sent_count = pending.sent_count.saturating_add(1);
                pending.last_sent_at = Some(now.clone());
                pending.failed_at = None;
            }
            due_events.push(ReliableWsEvent {
                r#type: "acquired_character".to_string(),
                event_id: record.event_id,
                sequence: record.sequence,
                requires_ack: true,
                paired,
                device_name: device_name.clone(),
                last_seen_at: last_seen_at.clone(),
                created_at: record.created_at,
                measuring_session_active,
                payload: record.payload,
            });
        }

        due_events
    }

    pub fn build_health_response(&self) -> HealthResponse {
        HealthResponse {
            ok: true,
            server_time: timestamp_string(),
        }
    }

    pub fn bump_sequence(&self) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.last_sequence += 1;
    }

    /** PC 側でコレクションを全消去したとき、モバイルへ同期し保留中の獲得イベントも破棄する */
    pub fn clear_pending_acquired_events(&self) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.pending_acks.clear();
    }

    pub fn build_ws_event(&self, event_type: &str) -> WsEvent {
        let state = self.inner.lock().expect("pairing state poisoned");
        WsEvent {
            r#type: event_type.to_string(),
            sequence: state.last_sequence,
            paired: state.paired,
            device_name: state.device_name.clone(),
            last_seen_at: state.last_seen_at.clone(),
            created_at: timestamp_string(),
            measuring_session_active: state.measuring_session_active,
        }
    }

    pub fn missing_token_error(&self) -> ErrorResponse {
        ErrorResponse {
            ok: false,
            error_code: "MISSING_TOKEN".to_string(),
            message: "token が指定されていません".to_string(),
        }
    }

    pub fn invalid_token_error(&self) -> ErrorResponse {
        ErrorResponse {
            ok: false,
            error_code: "INVALID_TOKEN".to_string(),
            message: "token が正しくありません".to_string(),
        }
    }

    pub fn missing_device_name_error(&self) -> ErrorResponse {
        ErrorResponse {
            ok: false,
            error_code: "MISSING_DEVICE_NAME".to_string(),
            message: "deviceName が指定されていません".to_string(),
        }
    }

}

pub fn timestamp_string() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch");

    duration.as_secs().to_string()
}

fn generate_token() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch");

    format!("{:x}{:x}", duration.as_secs(), duration.subsec_nanos())
}

fn local_ip_address() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map(|addr| match addr.ip() {
            IpAddr::V4(ipv4) => ipv4.to_string(),
            IpAddr::V6(ipv6) => ipv6.to_string(),
        })
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}
