use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingInfo {
    pub host: String,
    pub port: u16,
    pub token: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPairingStatus {
    pub paired: bool,
    pub device_name: Option<String>,
    pub last_seen_at: Option<String>,
}
