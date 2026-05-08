import type { RefObject } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../characters/types";
import type { RuntimeSnapshot } from "../../posture/types";
import type { SoundSettings } from "../../sound/types/soundSettings";
import type { MeasurementResult, MeasurementStats } from "../types";

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
  onRefreshPairing: () => void;
  onContinueFromPaired: () => void;
  onDebugStartMeasurement: () => void;
  onProfileCharacterSelect: (characterId: string) => void;
  onToggleFavoriteCharacter: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
  onDebugShowOnboarding: () => void;
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
