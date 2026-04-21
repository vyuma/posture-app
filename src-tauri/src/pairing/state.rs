use std::{
    net::{IpAddr, UdpSocket},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

use super::types::{DesktopPairingStatus, PairingInfo, VibrationPattern};

#[derive(Clone)]
pub struct PairingStateHandle {
    inner: Arc<Mutex<PairingState>>,
}

#[derive(Clone)]
pub struct PairingSnapshot {
    pub token: String,
    pub paired: bool,
}

struct PairingState {
    port: u16,
    token: String,
    paired: bool,
    device_name: Option<String>,
    last_seen_at: Option<String>,
    last_sequence: u64,
    last_pattern: Option<VibrationPattern>,
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
pub struct ErrorResponse {
    ok: bool,
    error_code: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventResponse {
    r#type: String,
    sequence: u64,
    pattern: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResponse {
    ok: bool,
    paired: bool,
    has_event: bool,
    event: Option<EventResponse>,
    server_time: String,
}

impl PairingStateHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PairingState {
                port: 0,
                token: generate_token(),
                paired: false,
                device_name: None,
                last_seen_at: None,
                last_sequence: 0,
                last_pattern: None,
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
            host: local_ip_address(),
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
            last_sequence: state.last_sequence,
        }
    }

    pub fn trigger_vibration(&self, pattern: VibrationPattern) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.last_sequence += 1;
        state.last_pattern = Some(pattern);
    }

    pub fn snapshot(&self) -> PairingSnapshot {
        let state = self.inner.lock().expect("pairing state poisoned");

        PairingSnapshot {
            token: state.token.clone(),
            paired: state.paired,
        }
    }

    pub fn pair_device(&self, device_name: String) -> PairResponse {
        let now = timestamp_string();
        let mut state = self.inner.lock().expect("pairing state poisoned");

        state.paired = true;
        state.device_name = Some(device_name.clone());
        state.last_seen_at = Some(now.clone());

        PairResponse {
            ok: true,
            paired: true,
            device_name,
            paired_at: now,
        }
    }

    pub fn update_last_seen(&self) {
        let mut state = self.inner.lock().expect("pairing state poisoned");
        state.last_seen_at = Some(timestamp_string());
    }

    pub fn build_health_response(&self) -> HealthResponse {
        HealthResponse {
            ok: true,
            server_time: timestamp_string(),
        }
    }

    pub fn build_poll_response(&self, last_sequence: u64) -> PollResponse {
        let state = self.inner.lock().expect("pairing state poisoned");
        let has_event = state.last_sequence > last_sequence && state.last_pattern.is_some();
        let event = if has_event {
            Some(EventResponse {
                r#type: "vibrate".to_string(),
                sequence: state.last_sequence,
                pattern: state
                    .last_pattern
                    .expect("last pattern missing")
                    .as_str()
                    .to_string(),
                created_at: timestamp_string(),
            })
        } else {
            None
        };

        PollResponse {
            ok: true,
            paired: state.paired,
            has_event,
            event,
            server_time: timestamp_string(),
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

    pub fn not_paired_error(&self) -> ErrorResponse {
        ErrorResponse {
            ok: false,
            error_code: "NOT_PAIRED".to_string(),
            message: "端末がまだ接続されていません".to_string(),
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
