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
    pub last_sequence: u64,
}

#[derive(Clone, Copy)]
pub enum VibrationPattern {
    Short,
    Double,
    Long,
}

impl VibrationPattern {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Short => "short",
            Self::Double => "double",
            Self::Long => "long",
        }
    }
}

impl TryFrom<&str> for VibrationPattern {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "short" => Ok(Self::Short),
            "double" => Ok(Self::Double),
            "long" => Ok(Self::Long),
            _ => Err(format!("unsupported vibration pattern: {value}")),
        }
    }
}
