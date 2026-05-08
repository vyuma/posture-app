import type { RefObject } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../characters/types";
import type { RuntimeSnapshot } from "../../posture/types";
import type { SoundSettings } from "../../sound/types/soundSettings";
import type {
  MeasurementResult,
  MeasurementStats,
  PostureRegisterStep,
} from "../types";

export type HomeScreenProps = {
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  profileCharacter: CharacterDefinition | null;
  selectedProfileCharacterId: string | null;
  favoriteCharacterIds: Set<string>;
  collectionResetTick: number;
  qrImageDataUrl: string;
  isPairingLoading: boolean;
  pairingError: string | null;
  isPaired: boolean;
  deviceName: string | null;
  qrCharacter: CharacterDefinition | null;
  isStartPending: boolean;
  onOpenMobileConnect: () => void;
  onPairingStatusRefresh: () => void;
  onContinueFromPaired: () => void;
  onDebugStartMeasurement: () => void;
  onProfileCharacterSelect: (characterId: string) => void;
  onToggleFavoriteCharacter: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
  onDebugShowOnboarding: () => void;
};

export type MobileConnectScreenProps = {
  qrImageDataUrl: string;
  isPairingLoading: boolean;
  pairingError: string | null;
  isPaired: boolean;
  featuredCharacter: CharacterDefinition | null;
  onContinueFromPaired: () => void;
  onBackHome: () => void;
};

export type CodeReadScreenProps = {
  isStartPending: boolean;
  soundSettings: SoundSettings;
  onSoundSettingsChange: (next: SoundSettings) => void;
  isCharacterOverlayEnabled: boolean;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  onStartMeasurement: () => void;
  onBackHome: () => void;
};

export type PostureRegisterFlowScreenProps = {
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
  onBackHome: () => void;
};

export type MeasuringScreenProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  snapshot: RuntimeSnapshot;
  stats: MeasurementStats;
  isBadPosture: boolean;
  isPaused: boolean;
  isOverlayEnabled: boolean;
  isCharacterOverlayEnabled: boolean;
  soundSettings: SoundSettings;
  onSoundSettingsChange: (next: SoundSettings) => void;
  onFinishMeasurement: () => void;
  /** 測定を中断せず基準姿勢の再登録フローへ */
  onReRegisterPosture: () => void;
  onPauseToggle: () => void;
  onOverlayEnabledChange: (enabled: boolean) => void;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  onShowCharacterOverlay: () => void;
  onResetCharacterPosition: () => void;
};

export type PostureRegisteredScreenProps = {
  result: MeasurementResult;
  acquiredCharacter: CharacterDefinition | null;
  fallbackCharacter: CharacterDefinition | null;
  onBackHome: () => void;
};
