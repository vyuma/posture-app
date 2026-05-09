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
import type { AcquiredCharacter } from "./features/characters/types";
import { AppFlowRouter } from "./features/flow/components/AppFlowRouter";
import type {
  AppFlowPhase,
  MeasurementResult,
  MeasurementStats,
  PostureRegisterStep,
} from "./features/flow/types";
import { PermissionPopup } from "./features/flow/components/PermissionPopup";
import {
  createMeasurementAccumulator,
  EMPTY_MEASUREMENT_STATS,
  REWARD_RULE,
  toMeasurementStats,
} from "./features/flow/services/measurementSession";
import {
  hasCompletedOnboardingStory,
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
import {
  disconnectPairingDevice,
  sendAcquiredCharacterEvent,
  sendAcquiredCharactersCleared,
  sendPostureSignal,
  syncPairingMeasuringSession,
  syncPairingGoodPostureRegistration,
} from "./features/pairing/services/desktopBridge";
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

/** カメラ権限が拒否されている／取得に失敗したときの共通案内 */
const CAMERA_PERMISSION_BLOCKED_MESSAGE_JA =
  "カメラを利用するには許可が必要です。OSまたはブラウザーの設定でこのアプリにカメラを許可してから、もう一度お試しください。";

function statusIndicatesCameraPermissionFailure(status: string): boolean {
  const lower = status.toLowerCase();
  return (
    lower.includes("notallowederror") ||
    lower.includes("permission denied") ||
    lower.includes("permission")
  );
}

async function ensurePairedAndCameraPermission(
  isPairedLive: boolean,
  setPermissionPopupMessage: (message: string | null) => void,
  /** 未ペア時は案内どおりホームで「スマホと接続」へ誘導する */
  onPairingMissing?: () => void,
): Promise<boolean> {
  if (!isPairedLive) {
    setPermissionPopupMessage(
      "スマートフォンとの接続を確認してください。ホームの「スマホと接続」で QR をスキャンし、接続が完了した状態で再度お試しください。",
    );
    onPairingMissing?.();
    return false;
  }

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    setPermissionPopupMessage(
      "この環境ではカメラを利用できません。ブラウザーまたはOS設定をご確認ください。",
    );
    return false;
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
        setPermissionPopupMessage(CAMERA_PERMISSION_BLOCKED_MESSAGE_JA);
        return false;
      }
    } catch {
      // 権限状態を事前取得できない環境では通常フローを継続する。
    }
  }

  return true;
}

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
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() =>
    loadSoundSettings(),
  );
  const [postureRegisterStep, setPostureRegisterStep] =
    useState<PostureRegisterStep>("intro");

  const trackingEnabled =
    flowPhase === "measuring" ||
    (flowPhase === "postureRegister" && postureRegisterStep !== "intro");
  const isMeasuringPhase = flowPhase === "measuring";
  const isPostureRegisterLive =
    flowPhase === "postureRegister" && postureRegisterStep !== "intro";

  useEffect(() => {
    void syncPairingMeasuringSession(isMeasuringPhase).catch(() => {
      // Browser preview cannot reach the native pairing bridge.
    });
  }, [isMeasuringPhase]);

  useEffect(() => {
    void syncPairingGoodPostureRegistration(isPostureRegisterLive).catch(() => {
      // Browser preview cannot reach the native pairing bridge.
    });
  }, [isPostureRegisterLive]);
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
    refresh: refreshPairingSnapshot,
  } = usePairingState();

  const pairingLink = buildPairingLink(pairingInfo);
  const qrImageDataUrl = useQrDataUrl(pairingLink);
  const isPairedLive =
    Boolean(pairingStatus?.paired) && (pairingStatus?.wsClientCount ?? 0) > 0;
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
    flowPhase === "measuring" &&
    trackingEnabled &&
    snapshot.baselineReady &&
    !isPaused &&
    isBadPosture;

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
    if (flowPhase === "postureRegister") {
      return;
    }

    setPostureRegisterStep("intro");
  }, [flowPhase]);

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
    accumulator.activeMeasurementMs += deltaMs;

    if (latestSnapshot.postureState === "good") {
      accumulator.goodMs += deltaMs;
    }

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
    <PermissionPopup
      message={permissionPopupMessage}
      onClose={() => setPermissionPopupMessage(null)}
    />
  ) : null;

  const handleStartMeasurement = async () => {
    if (isStartPending) {
      return;
    }

    setIsStartPending(true);

    try {
      const ok = await ensurePairedAndCameraPermission(
        isPairedLive,
        setPermissionPopupMessage,
        () => setFlowPhase("home"),
      );
      if (!ok) {
        return;
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

  const handleBeginPostureRegisterCalibrating = useCallback(async () => {
    if (isStartPending) {
      return;
    }

    setIsStartPending(true);

    try {
      const ok = await ensurePairedAndCameraPermission(
        isPairedLive,
        setPermissionPopupMessage,
        () => setFlowPhase("home"),
      );
      if (!ok) {
        return;
      }

      resetPostureEngine();
      setPostureRegisterStep("calibrating");
    } finally {
      setIsStartPending(false);
    }
  }, [isPairedLive, isStartPending, resetPostureEngine]);

  const handlePostureRegisterCalibratingComplete = useCallback(() => {
    setPostureRegisterStep("settings");
  }, []);

  const handleBeginMeasurementAfterRegister = useCallback(async () => {
    if (isStartPending) {
      return;
    }

    if (!snapshot.baselineReady) {
      setPermissionPopupMessage(
        "基準線の学習が完了していません。しばらくお待ちのうえ、もう一度お試しください。",
      );
      return;
    }

    setIsStartPending(true);

    try {
      const ok = await ensurePairedAndCameraPermission(
        isPairedLive,
        setPermissionPopupMessage,
        () => setFlowPhase("home"),
      );
      if (!ok) {
        return;
      }

      measurementAccumulatorRef.current = createMeasurementAccumulator();
      measurementStartedAtRef.current = new Date().toISOString();
      setMeasurementStats(EMPTY_MEASUREMENT_STATS);
      setLastMeasurementResult(null);
      setLastAcquiredCharacterId(null);
      setIsPaused(false);
      setFlowPhase("measuring");
      void primeRecoverySound();
    } finally {
      setIsStartPending(false);
    }
  }, [isPairedLive, isStartPending, snapshot.baselineReady]);

  const handleReRegisterPostureFromMeasuring = useCallback(() => {
    setIsPaused(false);
    setMeasurementStats(EMPTY_MEASUREMENT_STATS);
    measurementAccumulatorRef.current = createMeasurementAccumulator();
    measurementStartedAtRef.current = null;
    resetPostureEngine();
    setPostureRegisterStep("calibrating");
    setFlowPhase("postureRegister");
  }, [resetPostureEngine]);

  const handleFinishMeasurement = useCallback(() => {
    const finalStats = sampleMeasurementStats();
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
          },
        ];
        acquiredCharacterId = nextRewardCharacter.id;
        setAcquiredCharacters(nextAcquiredCharacters);
        saveAcquiredCharacters(nextAcquiredCharacters);
        void sendAcquiredCharacterEvent({
          measurementId,
          acquiredAt: endedAt,
          characterId: nextRewardCharacter.id,
          characterName: nextRewardCharacter.name,
          rarity: nextRewardCharacter.rarity,
          activeMeasurementMs: finalStats.activeMeasurementMs,
          goodMs: finalStats.goodMs,
          goodRatio: finalStats.goodRatio,
          story: nextRewardCharacter.story,
          portraitSrc: nextRewardCharacter.portraitSrc,
          personalityTags: nextRewardCharacter.personalityTags,
          characterColor: nextRewardCharacter.characterColor,
          toneClass: nextRewardCharacter.toneClass,
        }).catch(() => {
          // Browser preview cannot reach the native pairing bridge.
        });
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
    void sendAcquiredCharactersCleared().catch(() => {
      // ブラウザプレビューなど Tauri 外では無視
    });
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
    if (flowPhase !== "measuring" && flowPhase !== "postureRegister") {
      return;
    }

    if (flowPhase === "postureRegister" && postureRegisterStep === "intro") {
      return;
    }

    if (!statusIndicatesCameraPermissionFailure(status)) {
      return;
    }

    setPermissionPopupMessage(CAMERA_PERMISSION_BLOCKED_MESSAGE_JA);

    if (flowPhase === "postureRegister") {
      setPostureRegisterStep("intro");
    } else {
      setFlowPhase("qrScanned");
    }
  }, [flowPhase, postureRegisterStep, status]);

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

  return (
    <>
      <AppFlowRouter
        flowPhase={flowPhase}
        postureRegisterStep={postureRegisterStep}
        qrImageDataUrl={qrImageDataUrl}
        isPairingLoading={isPairingLoading}
        pairingError={pairingError}
        isPaired={isPairedLive}
        deviceName={pairingStatus?.deviceName ?? null}
        acquiredCharacters={acquiredCharacters}
        profileCharacter={profileCharacter}
        selectedProfileCharacterId={selectedProfileCharacterId}
        favoriteCharacterIds={favoriteCharacterIds}
        collectionResetTick={collectionResetTick}
        nextCharacter={nextCharacter}
        lastMeasurementResult={lastMeasurementResult}
        lastAcquiredCharacter={lastAcquiredCharacter}
        videoRef={videoRef}
        canvasRef={canvasRef}
        snapshot={snapshot}
        measurementStats={measurementStats}
        effectiveBadPosture={effectiveBadPosture}
        isPaused={isPaused}
        isOverlayEnabled={isOverlayEnabled}
        isCharacterOverlayEnabled={isCharacterOverlayEnabled}
        isStartPending={isStartPending}
        soundSettings={soundSettings}
        onSoundSettingsChange={setSoundSettings}
        onOpenMobileConnect={() => {
          void refreshPairingSnapshot();
          setFlowPhase("mobileConnect");
        }}
        onPairingStatusRefresh={() => {
          void refreshPairingSnapshot();
        }}
        onContinueFromPaired={() => {
          setPostureRegisterStep("intro");
          setFlowPhase("postureRegister");
        }}
        onDebugDisconnectPairingDevice={async () => {
          await disconnectPairingDevice();
          await refreshPairingSnapshot();
        }}
        onProfileCharacterSelect={handleProfileCharacterSelect}
        onToggleFavoriteCharacter={handleToggleFavoriteCharacter}
        onDebugClearAcquiredCharacters={handleDebugClearAcquiredCharacters}
        onDebugShowOnboarding={() => setFlowPhase("onboarding")}
        onCompleteOnboardingStory={handleCompleteOnboardingStory}
        onStartMeasurement={() => {
          void handleStartMeasurement();
        }}
        onBeginPostureRegisterCalibrating={() => {
          void handleBeginPostureRegisterCalibrating();
        }}
        onBeginMeasurementAfterRegister={() => {
          void handleBeginMeasurementAfterRegister();
        }}
        onPostureRegisterCalibratingComplete={
          handlePostureRegisterCalibratingComplete
        }
        onBackHome={() => setFlowPhase("home")}
        onFinishMeasurement={handleFinishMeasurement}
        onReRegisterPosture={handleReRegisterPostureFromMeasuring}
        onMeasureAgain={() => {
          void handleStartMeasurement();
        }}
        onPauseToggle={() => setIsPaused((current) => !current)}
        onOverlayEnabledChange={setIsOverlayEnabled}
        onCharacterOverlayEnabledChange={setIsCharacterOverlayEnabled}
        onShowCharacterOverlay={handleShowCharacterOverlay}
        onResetCharacterPosition={handleResetCharacterPosition}
      />
      {permissionPopup}
    </>
  );
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

export default App;
