import { CHARACTER_CATALOG } from "../../characters/characterCatalog";
import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../characters/types";
import { OnboardingStoryScreen } from "../../onboarding";
import type { usePostureTracking } from "../../posture";
import type { SoundSettings } from "../../sound/types/soundSettings";
import type {
  AppFlowPhase,
  MeasurementResult,
  MeasurementStats,
  PostureRegisterStep,
} from "../types";
import {
  CodeReadScreen,
  HomeScreen,
  MeasuringScreen,
  MobileConnectScreen,
  PostureRegisterFlowScreen,
  PostureRegisteredScreen,
} from "./FlowScreens";

type AppFlowRouterProps = {
  flowPhase: AppFlowPhase;
  postureRegisterStep: PostureRegisterStep;
  qrImageDataUrl: string;
  isPairingLoading: boolean;
  pairingError: string | null;
  isPaired: boolean;
  deviceName: string | null;
  acquiredCharacters: AcquiredCharacter[];
  profileCharacter: CharacterDefinition | null;
  selectedProfileCharacterId: string | null;
  favoriteCharacterIds: Set<string>;
  collectionResetTick: number;
  nextCharacter: CharacterDefinition | null;
  lastMeasurementResult: MeasurementResult | null;
  lastAcquiredCharacter: CharacterDefinition | null;
  videoRef: ReturnType<typeof usePostureTracking>["videoRef"];
  canvasRef: ReturnType<typeof usePostureTracking>["canvasRef"];
  snapshot: ReturnType<typeof usePostureTracking>["snapshot"];
  measurementStats: MeasurementStats;
  effectiveBadPosture: boolean;
  isPaused: boolean;
  isOverlayEnabled: boolean;
  isCharacterOverlayEnabled: boolean;
  isStartPending: boolean;
  soundSettings: SoundSettings;
  onSoundSettingsChange: (next: SoundSettings) => void;
  onOpenMobileConnect: () => void;
  onPairingStatusRefresh: () => void;
  onContinueFromPaired: () => void;
  onProfileCharacterSelect: (characterId: string) => void;
  onToggleFavoriteCharacter: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
  onDebugShowOnboarding: () => void;
  onCompleteOnboardingStory: () => void;
  onStartMeasurement: () => void;
  onBeginPostureRegisterCalibrating: () => void;
  onBeginMeasurementAfterRegister: () => void;
  onPostureRegisterCalibratingComplete: () => void;
  onBackHome: () => void;
  onFinishMeasurement: () => void;
  onMeasureAgain: () => void;
  onPauseToggle: () => void;
  onOverlayEnabledChange: (enabled: boolean) => void;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  onShowCharacterOverlay: () => void;
  onResetCharacterPosition: () => void;
};

export function AppFlowRouter({
  flowPhase,
  postureRegisterStep,
  qrImageDataUrl,
  isPairingLoading,
  pairingError,
  isPaired,
  deviceName,
  acquiredCharacters,
  profileCharacter,
  selectedProfileCharacterId,
  favoriteCharacterIds,
  collectionResetTick,
  nextCharacter,
  lastMeasurementResult,
  lastAcquiredCharacter,
  videoRef,
  canvasRef,
  snapshot,
  measurementStats,
  effectiveBadPosture,
  isPaused,
  isOverlayEnabled,
  isCharacterOverlayEnabled,
  isStartPending,
  soundSettings,
  onSoundSettingsChange,
  onOpenMobileConnect,
  onPairingStatusRefresh,
  onContinueFromPaired,
  onProfileCharacterSelect,
  onToggleFavoriteCharacter,
  onDebugClearAcquiredCharacters,
  onDebugShowOnboarding,
  onCompleteOnboardingStory,
  onStartMeasurement,
  onBeginPostureRegisterCalibrating,
  onBeginMeasurementAfterRegister,
  onPostureRegisterCalibratingComplete,
  onBackHome,
  onFinishMeasurement,
  onMeasureAgain,
  onPauseToggle,
  onOverlayEnabledChange,
  onCharacterOverlayEnabledChange,
  onShowCharacterOverlay,
  onResetCharacterPosition,
}: AppFlowRouterProps) {
  switch (flowPhase) {
    case "onboarding":
      return (
        <OnboardingStoryScreen onComplete={onCompleteOnboardingStory} />
      );
    case "home":
      return (
        <HomeScreen
          characters={CHARACTER_CATALOG}
          acquiredCharacters={acquiredCharacters}
          profileCharacter={profileCharacter}
          selectedProfileCharacterId={selectedProfileCharacterId}
          favoriteCharacterIds={favoriteCharacterIds}
          collectionResetTick={collectionResetTick}
          qrImageDataUrl={qrImageDataUrl}
          isPairingLoading={isPairingLoading}
          pairingError={pairingError}
          isPaired={isPaired}
          deviceName={deviceName}
          qrCharacter={nextCharacter}
          isStartPending={isStartPending}
          onOpenMobileConnect={onOpenMobileConnect}
          onPairingStatusRefresh={onPairingStatusRefresh}
          onContinueFromPaired={onContinueFromPaired}
          onDebugStartMeasurement={onStartMeasurement}
          onProfileCharacterSelect={onProfileCharacterSelect}
          onToggleFavoriteCharacter={onToggleFavoriteCharacter}
          onDebugClearAcquiredCharacters={onDebugClearAcquiredCharacters}
          onDebugShowOnboarding={onDebugShowOnboarding}
        />
      );
    case "mobileConnect":
      return (
        <MobileConnectScreen
          qrImageDataUrl={qrImageDataUrl}
          isPairingLoading={isPairingLoading}
          pairingError={pairingError}
          isPaired={isPaired}
          featuredCharacter={nextCharacter}
          onContinueFromPaired={onContinueFromPaired}
          onBackHome={onBackHome}
        />
      );
    case "qrScanned":
      return (
        <CodeReadScreen
          isStartPending={isStartPending}
          soundSettings={soundSettings}
          onSoundSettingsChange={onSoundSettingsChange}
          isCharacterOverlayEnabled={isCharacterOverlayEnabled}
          onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
          onStartMeasurement={onStartMeasurement}
          onBackHome={onBackHome}
        />
      );
    case "postureRegister":
      return (
        <PostureRegisterFlowScreen
          postureRegisterStep={postureRegisterStep}
          videoRef={videoRef}
          canvasRef={canvasRef}
          snapshot={snapshot}
          isBadPosture={effectiveBadPosture}
          isOverlayEnabled={isOverlayEnabled}
          isCharacterOverlayEnabled={isCharacterOverlayEnabled}
          soundSettings={soundSettings}
          onSoundSettingsChange={onSoundSettingsChange}
          onOverlayEnabledChange={onOverlayEnabledChange}
          onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
          isStartPending={isStartPending}
          onRequestBeginCalibrating={onBeginPostureRegisterCalibrating}
          onBeginMeasurementAfterRegister={onBeginMeasurementAfterRegister}
          onCalibratingComplete={onPostureRegisterCalibratingComplete}
          onBackHome={onBackHome}
        />
      );
    case "measuring":
      return (
        <MeasuringScreen
          videoRef={videoRef}
          canvasRef={canvasRef}
          snapshot={snapshot}
          stats={measurementStats}
          isBadPosture={effectiveBadPosture}
          isPaused={isPaused}
          isOverlayEnabled={isOverlayEnabled}
          isCharacterOverlayEnabled={isCharacterOverlayEnabled}
          soundSettings={soundSettings}
          onSoundSettingsChange={onSoundSettingsChange}
          onFinishMeasurement={onFinishMeasurement}
          onPauseToggle={onPauseToggle}
          onOverlayEnabledChange={onOverlayEnabledChange}
          onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
          onShowCharacterOverlay={onShowCharacterOverlay}
          onResetCharacterPosition={onResetCharacterPosition}
        />
      );
    case "postureRegistered":
      return lastMeasurementResult ? (
        <PostureRegisteredScreen
          result={lastMeasurementResult}
          acquiredCharacter={lastAcquiredCharacter}
          fallbackCharacter={nextCharacter}
          onBackHome={onBackHome}
        />
      ) : (
        <HomeScreen
          characters={CHARACTER_CATALOG}
          acquiredCharacters={acquiredCharacters}
          profileCharacter={profileCharacter}
          selectedProfileCharacterId={selectedProfileCharacterId}
          favoriteCharacterIds={favoriteCharacterIds}
          collectionResetTick={collectionResetTick}
          qrImageDataUrl={qrImageDataUrl}
          isPairingLoading={isPairingLoading}
          pairingError={pairingError}
          isPaired={isPaired}
          deviceName={deviceName}
          qrCharacter={nextCharacter}
          isStartPending={isStartPending}
          onOpenMobileConnect={onOpenMobileConnect}
          onPairingStatusRefresh={onPairingStatusRefresh}
          onContinueFromPaired={onContinueFromPaired}
          onDebugStartMeasurement={onMeasureAgain}
          onProfileCharacterSelect={onProfileCharacterSelect}
          onToggleFavoriteCharacter={onToggleFavoriteCharacter}
          onDebugClearAcquiredCharacters={onDebugClearAcquiredCharacters}
          onDebugShowOnboarding={onDebugShowOnboarding}
        />
      );
  }
}
