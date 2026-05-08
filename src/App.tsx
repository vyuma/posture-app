import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./styles/index.css";
import { CHARACTER_CATALOG, getNextUnacquiredCharacter } from "./features/characters/characterCatalog";
import {
  clearAcquiredCharacters,
  loadAcquiredCharacters,
  saveAcquiredCharacters,
} from "./features/characters/characterStorage";
import {
  loadFavoriteCharacterIds,
  saveFavoriteCharacterIds,
  toggleFavoriteCharacterId,
} from "./features/characters/favoriteCharacterStorage";
import {
  loadSelectedProfileCharacterId,
  saveSelectedProfileCharacterId,
} from "./features/characters/profileCharacterStorage";
import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "./features/characters/types";
import {
  CodeReadScreen,
  HomeScreen,
  MeasuringScreen,
  PostureRegisteredScreen,
} from "./features/flow/components/FlowScreens";
import type {
  AppFlowPhase,
  MeasurementResult,
  MeasurementStats,
  PostureTimelineSegment,
  RewardRule,
} from "./features/flow/types";
import {
  hasCompletedOnboardingStory,
  OnboardingStoryScreen,
  saveOnboardingStoryCompleted,
} from "./features/onboarding";
import {
  clearStoredPositionOffset,
  loadCharacterOverlayEnabled,
  saveCharacterOverlayEnabled,
  type OverlayMode,
  type OverlayStatePayload,
} from "./features/overlay/overlayState";
import { usePairingState } from "./features/pairing";
import { buildPairingLink } from "./features/pairing/services/pairingLink";
import { sendPostureSignal } from "./features/pairing/services/desktopBridge";
import {
  usePostureTracking,
  usePostureTransitionEffects,
} from "./features/posture";


import {
  configureRecoverySound,
  playRecoverySound,
  primeRecoverySound,
} from "./features/sound/services/recoverySound";
import {
  loadSoundSettings,
  saveSoundSettings,
} from "./features/sound/services/soundSettingsStorage";
import type { SoundSettings } from "./features/sound/types/soundSettings";
import { useQrDataUrl } from "./lib/useQrDataUrl";
import { preloadShareImageCache } from "./lib/shareResultCapture";

type MeasurementAccumulator = MeasurementStats & {
  lastSampleAtMs: number | null;
  postureTimeline: PostureTimelineSegment[];
};

/** 直前の active 終端に接する区間だけマージし、姿勢状態の切替で区間分割する */
function appendPostureTimelineSlice(
  timeline: PostureTimelineSegment[],
  prevActiveMs: number,
  nextActiveMs: number,
  isGood: boolean,
) {
  if (nextActiveMs <= prevActiveMs || !Number.isFinite(nextActiveMs)) {
    return;
  }

  const last = timeline[timeline.length - 1];
  if (
    last !== undefined &&
    last.endMs === prevActiveMs &&
    last.isGood === isGood
  ) {
    last.endMs = nextActiveMs;
    return;
  }

  timeline.push({
    startMs: prevActiveMs,
    endMs: nextActiveMs,
    isGood,
  });
}

function finalizePostureTimeline(
  timeline: PostureTimelineSegment[],
  activeMeasurementMs: number,
): PostureTimelineSegment[] {
  if (activeMeasurementMs <= 0 || timeline.length === 0) {
    return [];
  }

  const cloned = timeline.map((segment) => ({ ...segment }));
  const last = cloned[cloned.length - 1];
  if (last !== undefined) {
    last.endMs = activeMeasurementMs;
  }

  return cloned.filter((segment) => segment.endMs > segment.startMs);
}

const REWARD_RULE: RewardRule = {
  minDurationMs: 0,
  minGoodRatio: 0.5,
};
const EMPTY_MEASUREMENT_STATS: MeasurementStats = {
  activeMeasurementMs: 0,
  goodMs: 0,
  goodRatio: 0,
};

function App() {
  const [flowPhase, setFlowPhase] = useState<AppFlowPhase>(() =>
    hasCompletedOnboardingStory() ? "home" : "onboarding",
  );
  const [isStartPending, setIsStartPending] = useState(false);
  const [isOverlayEnabled, setIsOverlayEnabled] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isCharacterOverlayEnabled, setIsCharacterOverlayEnabled] = useState(() =>
    loadCharacterOverlayEnabled(),
  );
  const [permissionPopupMessage, setPermissionPopupMessage] = useState<
    string | null
  >(null);
  const [acquiredCharacters, setAcquiredCharacters] = useState<
    AcquiredCharacter[]
  >(() => loadAcquiredCharacters());
  const [selectedProfileCharacterId, setSelectedProfileCharacterId] = useState<
    string | null
  >(() => loadSelectedProfileCharacterId());
  const [favoriteCharacterIds, setFavoriteCharacterIds] = useState<Set<string>>(
    () => loadFavoriteCharacterIds(),
  );
  const [collectionResetTick, setCollectionResetTick] = useState(0);
  const [measurementStats, setMeasurementStats] = useState<MeasurementStats>(
    EMPTY_MEASUREMENT_STATS,
  );
  const [lastMeasurementResult, setLastMeasurementResult] =
    useState<MeasurementResult | null>(null);
  const [lastAcquiredCharacterId, setLastAcquiredCharacterId] = useState<
    string | null
  >(null);
  const [qrRegenerationTick, setQrRegenerationTick] = useState(0);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() =>
    loadSoundSettings(),
  );

  const trackingEnabled = flowPhase === "measuring";
  const {
    videoRef,
    canvasRef,
    status,
    isBadPosture,
    snapshot,
    resetPostureEngine,
  } = usePostureTracking({
    enabled: trackingEnabled,
    overlayEnabled: isOverlayEnabled,
    paused: isPaused,
  });

  const {
    pairingInfo,
    status: pairingStatus,
    isLoading: isPairingLoading,
    error: pairingError,
    refresh: refreshPairing,
  } = usePairingState();

  const pairingLink = buildPairingLink(pairingInfo);
  const qrImageDataUrl = useQrDataUrl(pairingLink, qrRegenerationTick);
  const isPaired = pairingStatus?.paired ?? false;
  const acquiredCharacterIds = useMemo(
    () => new Set(acquiredCharacters.map((character) => character.characterId)),
    [acquiredCharacters],
  );
  const nextCharacter = useMemo(
    () => getNextUnacquiredCharacter(acquiredCharacterIds),
    [acquiredCharacterIds],
  );
  const lastAcquiredCharacter = useMemo(
    () =>
      lastAcquiredCharacterId
        ? CHARACTER_CATALOG.find(
            (character) => character.id === lastAcquiredCharacterId,
          ) ?? null
        : null,
    [lastAcquiredCharacterId],
  );
  const profileCharacter = useMemo(
    () =>
      getProfileCharacter(
        acquiredCharacters,
        acquiredCharacterIds,
        selectedProfileCharacterId,
      ),
    [acquiredCharacterIds, acquiredCharacters, selectedProfileCharacterId],
  );
  const effectiveBadPosture =
    trackingEnabled && snapshot.baselineReady && !isPaused && isBadPosture;

  const measurementAccumulatorRef = useRef(createMeasurementAccumulator());
  const measurementStartedAtRef = useRef<string | null>(null);
  const latestSnapshotRef = useRef(snapshot);
  const latestPausedRef = useRef(isPaused);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    latestPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const nextProfileCharacter = getProfileCharacter(
      acquiredCharacters,
      acquiredCharacterIds,
      selectedProfileCharacterId,
    );
    const nextProfileCharacterId =
      nextProfileCharacter && acquiredCharacterIds.has(nextProfileCharacter.id)
        ? nextProfileCharacter.id
        : null;

    if (selectedProfileCharacterId === nextProfileCharacterId) {
      return;
    }

    setSelectedProfileCharacterId(nextProfileCharacterId);
    saveSelectedProfileCharacterId(nextProfileCharacterId);
  }, [acquiredCharacterIds, acquiredCharacters, selectedProfileCharacterId]);

  const handleRefreshPairing = useCallback(async () => {
    await refreshPairing();
    setQrRegenerationTick((current) => current + 1);
  }, [refreshPairing]);

  const sampleMeasurementStats = useCallback((nowMs = performance.now()) => {
    const latestSnapshot = latestSnapshotRef.current;
    const accumulator = measurementAccumulatorRef.current;

    if (!latestSnapshot.baselineReady || latestPausedRef.current) {
      accumulator.lastSampleAtMs = null;
      const nextStats = toMeasurementStats(accumulator);
      setMeasurementStats(nextStats);
      return nextStats;
    }

    if (accumulator.lastSampleAtMs === null) {
      accumulator.lastSampleAtMs = nowMs;
      const nextStats = toMeasurementStats(accumulator);
      setMeasurementStats(nextStats);
      return nextStats;
    }

    const deltaMs = Math.max(0, nowMs - accumulator.lastSampleAtMs);
    const prevActiveMs = accumulator.activeMeasurementMs;
    accumulator.activeMeasurementMs += deltaMs;

    if (latestSnapshot.postureState === "good") {
      accumulator.goodMs += deltaMs;
    }

    appendPostureTimelineSlice(
      accumulator.postureTimeline,
      prevActiveMs,
      accumulator.activeMeasurementMs,
      latestSnapshot.postureState === "good",
    );

    accumulator.lastSampleAtMs = nowMs;

    const nextStats = toMeasurementStats(accumulator);
    setMeasurementStats(nextStats);
    return nextStats;
  }, []);

  useEffect(() => {
    if (flowPhase !== "measuring") {
      return;
    }

    const intervalId = window.setInterval(() => {
      sampleMeasurementStats();
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [flowPhase, sampleMeasurementStats]);

  const permissionPopup = permissionPopupMessage ? (
    <section className="permission-popup-backdrop" role="dialog" aria-modal="true">
      <div className="permission-popup">
        <h2>カメラ権限を確認してください</h2>
        <p>{permissionPopupMessage}</p>
        <button
          type="button"
          className="permission-popup-close"
          onClick={() => setPermissionPopupMessage(null)}
        >
          閉じる
        </button>
      </div>
    </section>
  ) : null;

  const handleStartMeasurement = async () => {
    if (isStartPending) {
      return;
    }

    setIsStartPending(true);

    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setPermissionPopupMessage(
          "この環境ではカメラを利用できません。ブラウザーまたはOS設定をご確認ください。",
        );
        return;
      }

      if (
        typeof navigator.permissions !== "undefined" &&
        typeof navigator.permissions.query === "function"
      ) {
        try {
          const cameraPermission = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });

          if (cameraPermission.state === "denied") {
            setPermissionPopupMessage(
              "カメラ権限がオフになっています。OSまたはブラウザーの設定でこのアプリにカメラを許可してから、もう一度お試しください。",
            );
            return;
          }
        } catch {
          // 権限状態を事前取得できない環境では通常フローを継続する。
        }
      }

      measurementAccumulatorRef.current = createMeasurementAccumulator();
      measurementStartedAtRef.current = new Date().toISOString();
      setMeasurementStats(EMPTY_MEASUREMENT_STATS);
      setLastMeasurementResult(null);
      setLastAcquiredCharacterId(null);
      resetPostureEngine();
      setIsPaused(false);
      setFlowPhase("measuring");
      void primeRecoverySound();
    } finally {
      setIsStartPending(false);
    }
  };

  const handleFinishMeasurement = useCallback(() => {
    const finalStats = sampleMeasurementStats();
    const timelineForResult = finalizePostureTimeline(
      measurementAccumulatorRef.current.postureTimeline,
      finalStats.activeMeasurementMs,
    );
    const measurementId = `measurement-${Date.now()}`;
    const endedAt = new Date().toISOString();
    const rewardQualified =
      finalStats.activeMeasurementMs >= REWARD_RULE.minDurationMs &&
      finalStats.goodRatio >= REWARD_RULE.minGoodRatio;
    let acquiredCharacterId: string | null = null;

    if (rewardQualified) {
      const nextRewardCharacter = getNextUnacquiredCharacter(
        new Set(acquiredCharacters.map((character) => character.characterId)),
      );

      if (nextRewardCharacter) {
        const nextAcquiredCharacters = [
          ...acquiredCharacters,
          {
            characterId: nextRewardCharacter.id,
            acquiredAt: endedAt,
            measurementId,
            activeMeasurementMs: finalStats.activeMeasurementMs,
            goodMs: finalStats.goodMs,
            goodRatio: finalStats.goodRatio,
            postureTimeline: timelineForResult,
          },
        ];
        acquiredCharacterId = nextRewardCharacter.id;
        setAcquiredCharacters(nextAcquiredCharacters);
        saveAcquiredCharacters(nextAcquiredCharacters);
      }
    }

    setLastMeasurementResult({
      id: measurementId,
      startedAt: measurementStartedAtRef.current ?? endedAt,
      endedAt,
      activeMeasurementMs: finalStats.activeMeasurementMs,
      goodMs: finalStats.goodMs,
      goodRatio: finalStats.goodRatio,
      rewardQualified,
      acquiredCharacterId,
      postureTimeline: timelineForResult,
    });
    setLastAcquiredCharacterId(acquiredCharacterId);
    setIsPaused(false);
    setFlowPhase("postureRegistered");
  }, [acquiredCharacters, sampleMeasurementStats]);

  const handleProfileCharacterSelect = useCallback(
    (characterId: string) => {
      if (!acquiredCharacterIds.has(characterId)) {
        return;
      }

      setSelectedProfileCharacterId(characterId);
      saveSelectedProfileCharacterId(characterId);
    },
    [acquiredCharacterIds],
  );

  const handleToggleFavoriteCharacter = useCallback(
    (characterId: string) => {
      if (!acquiredCharacterIds.has(characterId)) {
        return;
      }

      setFavoriteCharacterIds((current) => {
        const next = toggleFavoriteCharacterId(current, characterId);
        saveFavoriteCharacterIds(next);
        return next;
      });
    },
    [acquiredCharacterIds],
  );

  const handleDebugClearAcquiredCharacters = useCallback(() => {
    clearAcquiredCharacters();
    saveAcquiredCharacters([]);
    setAcquiredCharacters([]);
    setLastAcquiredCharacterId(null);
    setSelectedProfileCharacterId(null);
    setFavoriteCharacterIds(new Set());
    saveFavoriteCharacterIds(new Set());
    setCollectionResetTick((current) => current + 1);
    saveSelectedProfileCharacterId(null);
  }, []);

  const handleCompleteOnboardingStory = useCallback(() => {
    saveOnboardingStoryCompleted();
    setFlowPhase("home");
  }, []);

  const handlePostureChanged = useCallback(async (isBad: boolean) => {
    await sendPostureSignal(isBad).catch(() => {
      // Browser preview cannot reach the native pairing bridge.
    });
  }, []);

  const handlePostureRecovered = useCallback(async () => {
    if (latestPausedRef.current) {
      return;
    }

    await playRecoverySound();
  }, []);

  usePostureTransitionEffects({
    isBadPosture: effectiveBadPosture,
    onPostureChanged: handlePostureChanged,
    onRecovered: handlePostureRecovered,
  });

  useEffect(() => {
    let disposed = false;

    const applyOverlayState = (state: OverlayStatePayload) => {
      if (!disposed) {
        const visible = !state.userHidden;
        setIsCharacterOverlayEnabled(visible);
        saveCharacterOverlayEnabled(visible);
      }
    };

    void invoke<OverlayStatePayload>("overlay_get_state")
      .then(applyOverlayState)
      .catch(() => {
        // Browser preview cannot reach Tauri commands.
      });

    const unlistenPromise = listen<OverlayStatePayload>(
      "overlay:state",
      ({ payload }) => {
        applyOverlayState(payload);
      },
    );

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const mode: OverlayMode =
      flowPhase === "measuring"
        ? isPaused
          ? "paused"
          : snapshot.baselineReady
            ? isBadPosture
              ? "bad"
              : "good"
            : "hidden"
        : "hidden";

    const syncOverlay = async () => {
      if (!isCharacterOverlayEnabled) {
        saveCharacterOverlayEnabled(false);
        await invoke("overlay_hide_character").catch(() => {});
        await invoke("overlay_set_mode", { mode }).catch(() => {});
        return;
      }

      saveCharacterOverlayEnabled(true);

      if (mode === "hidden") {
        await invoke("overlay_set_mode", { mode }).catch(() => {});
        await invoke("overlay_show_character").catch(() => {});
        return;
      }

      await invoke("overlay_show_character").catch(() => {});
      await invoke("overlay_set_mode", { mode }).catch(() => {});
    };

    void syncOverlay();
  }, [
    flowPhase,
    isBadPosture,
    isCharacterOverlayEnabled,
    isPaused,
    snapshot.baselineReady,
  ]);

  const handleShowCharacterOverlay = useCallback(() => {
    setIsCharacterOverlayEnabled(true);
  }, []);

  const handleResetCharacterPosition = useCallback(() => {
    clearStoredPositionOffset();
    void invoke("overlay_reset_position_offset").catch(() => {
      // Browser preview cannot reach Tauri commands.
    });
  }, []);

  useEffect(() => {
    if (!isPaused) {
      return;
    }

    void sendPostureSignal(false).catch(() => {
      // Browser preview cannot reach the native pairing bridge.
    });
  }, [isPaused]);

  useEffect(() => {
    if (flowPhase !== "measuring") {
      return;
    }

    const lowerStatus = status.toLowerCase();
    const isPermissionError =
      lowerStatus.includes("notallowederror") ||
      lowerStatus.includes("permission denied") ||
      lowerStatus.includes("permission");

    if (!isPermissionError) {
      return;
    }

    setPermissionPopupMessage(
      "カメラ権限が無効のため測定を開始できませんでした。設定でカメラを許可してから再度開始してください。",
    );
    setFlowPhase("qrScanned");
  }, [flowPhase, status]);

  useEffect(() => {
    configureRecoverySound({
      enabled: soundSettings.enabled,
      src: soundSettings.selectedSound,
      volume: soundSettings.volume,
    });
    saveSoundSettings(soundSettings);
  }, [soundSettings]);

  useEffect(() => {
    return () => {
      void Promise.allSettled([
        sendPostureSignal(false),
        invoke("overlay_set_mode", { mode: "hidden" }),
      ]);
    };
  }, []);

  // 共有画像で portrait が初回に欠ける問題を防ぐため、起動直後に
  // キャラ portrait と QR 失敗時のロゴをデータ URL キャッシュへ流し込む
  useEffect(() => {
    const portraitSrcs = CHARACTER_CATALOG.map(
      (character) => character.portraitSrc,
    );
    const auxSrcs = ["/logo/QRアナゴ.png"];
    void preloadShareImageCache([...portraitSrcs, ...auxSrcs]);
  }, []);

  const screen = renderFlowScreen({
    flowPhase,
    qrImageDataUrl,
    isPairingLoading,
    pairingError,
    isPaired,
    deviceName: pairingStatus?.deviceName ?? null,
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
    onSoundSettingsChange: setSoundSettings,
    onRefreshPairing: () => {
      void handleRefreshPairing();
    },
    onContinueFromPaired: () => setFlowPhase("qrScanned"),
    onProfileCharacterSelect: handleProfileCharacterSelect,
    onToggleFavoriteCharacter: handleToggleFavoriteCharacter,
    onDebugClearAcquiredCharacters: handleDebugClearAcquiredCharacters,
    onDebugShowOnboarding: () => setFlowPhase("onboarding"),
    onCompleteOnboardingStory: handleCompleteOnboardingStory,
    onStartMeasurement: () => {
      void handleStartMeasurement();
    },
    onBackHome: () => setFlowPhase("home"),
    onFinishMeasurement: handleFinishMeasurement,
    onMeasureAgain: () => {
      void handleStartMeasurement();
    },
    onPauseToggle: () => setIsPaused((current) => !current),
    onOverlayEnabledChange: setIsOverlayEnabled,
    onCharacterOverlayEnabledChange: setIsCharacterOverlayEnabled,
    onShowCharacterOverlay: handleShowCharacterOverlay,
    onResetCharacterPosition: handleResetCharacterPosition,
  });

  return (
    <>
      {screen}
      {permissionPopup}
    </>
  );
}

function renderFlowScreen({
  flowPhase,
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
  onRefreshPairing,
  onContinueFromPaired,
  onProfileCharacterSelect,
  onToggleFavoriteCharacter,
  onDebugClearAcquiredCharacters,
  onDebugShowOnboarding,
  onCompleteOnboardingStory,
  onStartMeasurement,
  onBackHome,
  onFinishMeasurement,
  onMeasureAgain,
  onPauseToggle,
  onOverlayEnabledChange,
  onCharacterOverlayEnabledChange,
  onShowCharacterOverlay,
  onResetCharacterPosition,
}: {
  flowPhase: AppFlowPhase;
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
  onRefreshPairing: () => void;
  onContinueFromPaired: () => void;
  onProfileCharacterSelect: (characterId: string) => void;
  onToggleFavoriteCharacter: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
  onDebugShowOnboarding: () => void;
  onCompleteOnboardingStory: () => void;
  onStartMeasurement: () => void;
  onBackHome: () => void;
  onFinishMeasurement: () => void;
  onMeasureAgain: () => void;
  onPauseToggle: () => void;
  onOverlayEnabledChange: (enabled: boolean) => void;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  onShowCharacterOverlay: () => void;
  onResetCharacterPosition: () => void;
}) {
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
          onRefreshPairing={onRefreshPairing}
          onContinueFromPaired={onContinueFromPaired}
          onDebugStartMeasurement={onStartMeasurement}
          onProfileCharacterSelect={onProfileCharacterSelect}
          onToggleFavoriteCharacter={onToggleFavoriteCharacter}
          onDebugClearAcquiredCharacters={onDebugClearAcquiredCharacters}
          onDebugShowOnboarding={onDebugShowOnboarding}
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
          onRefreshPairing={onRefreshPairing}
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

function getProfileCharacter(
  acquiredCharacters: AcquiredCharacter[],
  acquiredCharacterIds: Set<string>,
  selectedProfileCharacterId: string | null,
) {
  const selectedCharacter =
    selectedProfileCharacterId && acquiredCharacterIds.has(selectedProfileCharacterId)
      ? findCharacterById(selectedProfileCharacterId)
      : null;

  if (selectedCharacter) {
    return selectedCharacter;
  }

  for (const acquiredCharacter of acquiredCharacters) {
    const character = findCharacterById(acquiredCharacter.characterId);

    if (character) {
      return character;
    }
  }

  return CHARACTER_CATALOG[0] ?? null;
}

function findCharacterById(characterId: string) {
  return (
    CHARACTER_CATALOG.find((character) => character.id === characterId) ?? null
  );
}

function createMeasurementAccumulator(): MeasurementAccumulator {
  return {
    lastSampleAtMs: null,
    postureTimeline: [],
    ...EMPTY_MEASUREMENT_STATS,
  };
}

function toMeasurementStats(
  accumulator: MeasurementAccumulator,
): MeasurementStats {
  const goodRatio =
    accumulator.activeMeasurementMs > 0
      ? accumulator.goodMs / accumulator.activeMeasurementMs
      : 0;

  return {
    activeMeasurementMs: accumulator.activeMeasurementMs,
    goodMs: accumulator.goodMs,
    goodRatio,
  };
}

export default App;
