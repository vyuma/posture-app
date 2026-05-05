use std::sync::{Arc, Mutex};

use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OverlayMode {
    Hidden,
    Good,
    Bad,
    Paused,
}

impl OverlayMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Hidden => "hidden",
            Self::Good => "good",
            Self::Bad => "bad",
            Self::Paused => "paused",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "hidden" => Some(Self::Hidden),
            "good" => Some(Self::Good),
            "bad" => Some(Self::Bad),
            "paused" => Some(Self::Paused),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayStateSnapshot {
    pub mode: &'static str,
    pub user_hidden: bool,
    pub offset_x: i32,
    pub offset_y: i32,
}

impl OverlayStateSnapshot {
    pub fn is_visible(self) -> bool {
        self.mode != OverlayMode::Hidden.as_str() && !self.user_hidden
    }
}

#[derive(Clone)]
pub struct OverlayStateHandle {
    inner: Arc<Mutex<OverlayState>>,
}

#[derive(Clone, Copy, Debug)]
struct OverlayState {
    mode: OverlayMode,
    user_hidden: bool,
    offset_x: i32,
    offset_y: i32,
}

impl OverlayStateHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(OverlayState {
                mode: OverlayMode::Hidden,
                user_hidden: false,
                offset_x: 0,
                offset_y: 0,
            })),
        }
    }

    pub fn snapshot(&self) -> OverlayStateSnapshot {
        let state = self.inner.lock().expect("overlay state poisoned");
        Self::to_snapshot(*state)
    }

    pub fn set_mode(&self, mode: OverlayMode) -> OverlayStateSnapshot {
        let mut state = self.inner.lock().expect("overlay state poisoned");
        state.mode = mode;
        Self::to_snapshot(*state)
    }

    pub fn set_user_hidden(&self, user_hidden: bool) -> OverlayStateSnapshot {
        let mut state = self.inner.lock().expect("overlay state poisoned");
        state.user_hidden = user_hidden;
        Self::to_snapshot(*state)
    }

    pub fn set_position_offset(&self, offset_x: i32, offset_y: i32) -> OverlayStateSnapshot {
        let mut state = self.inner.lock().expect("overlay state poisoned");
        state.offset_x = offset_x;
        state.offset_y = offset_y;
        Self::to_snapshot(*state)
    }

    fn to_snapshot(state: OverlayState) -> OverlayStateSnapshot {
        OverlayStateSnapshot {
            mode: state.mode.as_str(),
            user_hidden: state.user_hidden,
            offset_x: state.offset_x,
            offset_y: state.offset_y,
        }
    }
}
