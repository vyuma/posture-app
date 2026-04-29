use std::sync::{Arc, Mutex};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OverlayPhase {
    Hidden,
    Entering,
    Idle,
    Exiting,
}

impl OverlayPhase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Hidden => "hidden",
            Self::Entering => "entering",
            Self::Idle => "idle",
            Self::Exiting => "exiting",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "hidden" => Some(Self::Hidden),
            "entering" => Some(Self::Entering),
            "idle" => Some(Self::Idle),
            "exiting" => Some(Self::Exiting),
            _ => None,
        }
    }
}

#[derive(Clone)]
pub struct OverlayStateHandle {
    inner: Arc<Mutex<OverlayState>>,
}

#[derive(Clone, Copy, Debug)]
struct OverlayState {
    phase: OverlayPhase,
    is_bad_posture: bool,
}

impl OverlayStateHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(OverlayState {
                phase: OverlayPhase::Hidden,
                is_bad_posture: false,
            })),
        }
    }

    pub fn phase_name(&self) -> &'static str {
        let state = self.inner.lock().expect("overlay state poisoned");
        state.phase.as_str()
    }

    pub fn transition_for_posture(&self, is_bad_posture: bool) -> Option<OverlayPhase> {
        let mut state = self.inner.lock().expect("overlay state poisoned");

        if is_bad_posture {
            if state.is_bad_posture {
                return None;
            }

            state.is_bad_posture = true;
            state.phase = OverlayPhase::Entering;
            return Some(OverlayPhase::Entering);
        }

        if !state.is_bad_posture {
            return None;
        }

        state.is_bad_posture = false;
        state.phase = OverlayPhase::Exiting;
        Some(OverlayPhase::Exiting)
    }

    pub fn transition_for_animation_complete(
        &self,
        completed_phase: OverlayPhase,
    ) -> Option<OverlayPhase> {
        let mut state = self.inner.lock().expect("overlay state poisoned");

        match completed_phase {
            OverlayPhase::Entering => {
                if state.phase != OverlayPhase::Entering {
                    return None;
                }

                if state.is_bad_posture {
                    state.phase = OverlayPhase::Idle;
                    Some(OverlayPhase::Idle)
                } else {
                    state.phase = OverlayPhase::Exiting;
                    Some(OverlayPhase::Exiting)
                }
            }
            OverlayPhase::Exiting => {
                if state.phase != OverlayPhase::Exiting {
                    return None;
                }

                if state.is_bad_posture {
                    state.phase = OverlayPhase::Entering;
                    Some(OverlayPhase::Entering)
                } else {
                    state.phase = OverlayPhase::Hidden;
                    Some(OverlayPhase::Hidden)
                }
            }
            OverlayPhase::Idle | OverlayPhase::Hidden => None,
        }
    }

}
