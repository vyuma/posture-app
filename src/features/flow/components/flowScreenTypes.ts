import type { RefObject } from "react";
import type { RuntimeSnapshot } from "../../posture/types";
import type { SoundSettings } from "../../sound/types/soundSettings";
import type { PostureRegisterStep } from "../types";
export type PostureRegisterFlowScreenProps = {
  onBackHome: () => void;
  postureRegisterStep: PostureRegisterStep;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  snapshot: RuntimeSnapshot;
  isBadPosture: boolean;
  isOverlayEnabled: boolean;
  isCharacterOverlayEnabled: boolean;
  soundSettings: SoundSettings;
  onSoundSettingsChange: (next: SoundSettings) => void;
  onOverlayEnabledChange: (enabled: boolean) => void;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  isStartPending: boolean;
  onRequestBeginCalibrating: () => void | Promise<void>;
  onBeginMeasurementAfterRegister: () => void | Promise<void>;
  onCalibratingComplete: () => void;
  onResetCharacterPosition: () => void;
};

