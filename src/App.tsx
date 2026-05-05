import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./App.css";
import { CHARACTER_CATALOG, getNextUnacquiredCharacter } from "./features/characters/characterCatalog";
import {
  clearAcquiredCharacters,
  loadAcquiredCharacters,
  saveAcquiredCharacters,
} from "./features/characters/characterStorage";
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
  RewardRule,
} from "./features/flow/types";
import { usePairingState } from "./features/pairing";
import { buildPairingLink } from "./features/pairing/services/pairingLink";
import {
  usePostureTracking,
  usePostureTransitionEffects,
} from "./features/posture";
import { SoundSettingsDialog } from "./features/sound/components/SoundSettingsDialog";
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
import { generateQrDataUrl } from "./lib/qrcode";
import { sendPostureSignal } from "./lib/desktopBridge";

type OverlayMode = "hidden" | "good" | "bad" | "paused";
type OverlayStatePayload = {
  mode: OverlayMode;
  userHidden: boolean;
  offsetX: number;
  offsetY: number;
};

type MeasurementAccumulator = MeasurementStats & {
  activeStartedAtMs: number | null;
  lastSampleAtMs: number | null;
};

const CHARACTER_OVERLAY_STORAGE_KEY = "posture.overlay.characterVisible.v1";
const OVERLAY_OFFSET_STORAGE_KEY = "posture.overlay.positionOffset.v1";
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
  const [flowPhase, setFlowPhase] = useState<AppFlowPhase>("home");
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
  const [collectionResetTick, setCollectionResetTick] = useState(0);
  const [measurementStats, setMeasurementStats] = useState<MeasurementStats>(
    EMPTY_MEASUREMENT_STATS,
  );
  const [lastMeasurementResult, setLastMeasurementResult] =
    useState<MeasurementResult | null>(null);
  const [lastAcquiredCharacterId, setLastAcquiredCharacterId] = useState<
    string | null
  >(null);
  const [qrImageDataUrl, setQrImageDataUrl] = useState("");
  const [qrRegenerationTick, setQrRegenerationTick] = useState(0);
  const [isSoundDialogOpen, setIsSoundDialogOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() =>
    loadSoundSettings(),
  );

  const trackingEnabled = flowPhase === "measuring";
  const {
    videoRef,
    canvasRef,
    ready,
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
  const previousPairedRef = useRef<boolean | null>(null);

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

  useEffect(() => {
    let disposed = false;
    setQrImageDataUrl("");

    if (!pairingLink) {
      return () => {
        disposed = true;
      };
    }

    void generateQrDataUrl(pairingLink)
      .then((dataUrl) => {
        if (!disposed) {
          setQrImageDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!disposed) {
          setQrImageDataUrl("");
        }
      });

    return () => {
      disposed = true;
    };
  }, [pairingLink, qrRegenerationTick]);

  const handleRefreshPairing = useCallback(async () => {
    await refreshPairing();
    setQrRegenerationTick((current) => current + 1);
  }, [refreshPairing]);

  useEffect(() => {
    const paired = pairingStatus?.paired ?? false;
    const previousPaired = previousPairedRef.current;
    previousPairedRef.current = paired;

    if (previousPaired === null) {
      return;
    }

    if (flowPhase === "home" && !previousPaired && paired) {
      setFlowPhase("qrScanned");
    }
  }, [flowPhase, pairingStatus?.paired]);

  const sampleMeasurementStats = useCallback((nowMs = performance.now()) => {
    const latestSnapshot = latestSnapshotRef.current;
    const accumulator = measurementAccumulatorRef.current;

    if (!latestSnapshot.baselineReady || latestPausedRef.current) {
      accumulator.lastSampleAtMs = null;
      const nextStats = toMeasurementStats(accumulator);
      setMeasurementStats(nextStats);
      return nextStats;
    }

    if (accumulator.activeStartedAtMs === null) {
      accumulator.activeStartedAtMs = nowMs;
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

  const handleDebugClearAcquiredCharacters = useCallback(() => {
    clearAcquiredCharacters();
    saveAcquiredCharacters([]);
    setAcquiredCharacters([]);
    setLastAcquiredCharacterId(null);
    setSelectedProfileCharacterId(null);
    setCollectionResetTick((current) => current + 1);
    saveSelectedProfileCharacterId(null);
  }, []);

  const handlePostureChanged = useCallback(async (isBad: boolean) => {
    await Promise.allSettled([sendPostureSignal(isBad)]);
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
    try {
      window.localStorage.removeItem(OVERLAY_OFFSET_STORAGE_KEY);
    } catch {
      // Ignore storage failures in browser preview.
    }

    void invoke("overlay_reset_position_offset").catch(() => {
      // Browser preview cannot reach Tauri commands.
    });
  }, []);

  useEffect(() => {
    if (!isPaused) {
      return;
    }

    void Promise.allSettled([sendPostureSignal(false)]);
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
    collectionResetTick,
    nextCharacter,
    lastMeasurementResult,
    lastAcquiredCharacter,
    ready,
    videoRef,
    canvasRef,
    status,
    snapshot,
    measurementStats,
    effectiveBadPosture,
    isPaused,
    isOverlayEnabled,
    isCharacterOverlayEnabled,
    isStartPending,
    onRefreshPairing: () => {
      void handleRefreshPairing();
    },
    onContinueFromPaired: () => setFlowPhase("qrScanned"),
    onProfileCharacterSelect: handleProfileCharacterSelect,
    onDebugClearAcquiredCharacters: handleDebugClearAcquiredCharacters,
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
    onOpenSoundSettings: () => setIsSoundDialogOpen(true),
  });

  return (
    <>
      {screen}
      {isSoundDialogOpen ? (
        <SoundSettingsDialog
          settings={soundSettings}
          onChange={setSoundSettings}
          onClose={() => setIsSoundDialogOpen(false)}
          onPreview={() => {
            void primeRecoverySound();
            void playRecoverySound();
          }}
        />
      ) : null}
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
  collectionResetTick,
  nextCharacter,
  lastMeasurementResult,
  lastAcquiredCharacter,
  ready,
  status,
  videoRef,
  canvasRef,
  snapshot,
  measurementStats,
  effectiveBadPosture,
  isPaused,
  isOverlayEnabled,
  isCharacterOverlayEnabled,
  isStartPending,
  onRefreshPairing,
  onContinueFromPaired,
  onProfileCharacterSelect,
  onDebugClearAcquiredCharacters,
  onStartMeasurement,
  onBackHome,
  onFinishMeasurement,
  onMeasureAgain,
  onPauseToggle,
  onOverlayEnabledChange,
  onCharacterOverlayEnabledChange,
  onShowCharacterOverlay,
  onResetCharacterPosition,
  onOpenSoundSettings,
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
  collectionResetTick: number;
  nextCharacter: CharacterDefinition | null;
  lastMeasurementResult: MeasurementResult | null;
  lastAcquiredCharacter: CharacterDefinition | null;
  ready: boolean;
  status: string;
  videoRef: ReturnType<typeof usePostureTracking>["videoRef"];
  canvasRef: ReturnType<typeof usePostureTracking>["canvasRef"];
  snapshot: ReturnType<typeof usePostureTracking>["snapshot"];
  measurementStats: MeasurementStats;
  effectiveBadPosture: boolean;
  isPaused: boolean;
  isOverlayEnabled: boolean;
  isCharacterOverlayEnabled: boolean;
  isStartPending: boolean;
  onRefreshPairing: () => void;
  onContinueFromPaired: () => void;
  onProfileCharacterSelect: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
  onStartMeasurement: () => void;
  onBackHome: () => void;
  onFinishMeasurement: () => void;
  onMeasureAgain: () => void;
  onPauseToggle: () => void;
  onOverlayEnabledChange: (enabled: boolean) => void;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  onShowCharacterOverlay: () => void;
  onResetCharacterPosition: () => void;
  onOpenSoundSettings: () => void;
}) {
  switch (flowPhase) {
    case "home":
      return (
        <HomeScreen
          characters={CHARACTER_CATALOG}
          acquiredCharacters={acquiredCharacters}
          profileCharacter={profileCharacter}
          selectedProfileCharacterId={selectedProfileCharacterId}
          collectionResetTick={collectionResetTick}
          qrImageDataUrl={qrImageDataUrl}
          isPairingLoading={isPairingLoading}
          pairingError={pairingError}
          isPaired={isPaired}
          deviceName={deviceName}
          qrCharacter={nextCharacter}
          onRefreshPairing={onRefreshPairing}
          onContinueFromPaired={onContinueFromPaired}
          onProfileCharacterSelect={onProfileCharacterSelect}
          onDebugClearAcquiredCharacters={onDebugClearAcquiredCharacters}
        />
      );
    case "qrScanned":
      return (
        <CodeReadScreen
          nextCharacter={nextCharacter}
          isStartPending={isStartPending}
          onStartMeasurement={onStartMeasurement}
          onBackHome={onBackHome}
        />
      );
    case "measuring":
      return (
        <MeasuringScreen
          videoRef={videoRef}
          canvasRef={canvasRef}
          ready={ready}
          status={status}
          snapshot={snapshot}
          stats={measurementStats}
          isBadPosture={effectiveBadPosture}
          isPaused={isPaused}
          isOverlayEnabled={isOverlayEnabled}
          isCharacterOverlayEnabled={isCharacterOverlayEnabled}
          onFinishMeasurement={onFinishMeasurement}
          onPauseToggle={onPauseToggle}
          onOverlayEnabledChange={onOverlayEnabledChange}
          onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
          onShowCharacterOverlay={onShowCharacterOverlay}
          onResetCharacterPosition={onResetCharacterPosition}
          onOpenSoundSettings={onOpenSoundSettings}
        />
      );
    case "postureRegistered":
      return lastMeasurementResult ? (
        <PostureRegisteredScreen
          result={lastMeasurementResult}
          acquiredCharacter={lastAcquiredCharacter}
          onBackHome={onBackHome}
          onMeasureAgain={onMeasureAgain}
        />
      ) : (
        <HomeScreen
          characters={CHARACTER_CATALOG}
          acquiredCharacters={acquiredCharacters}
          profileCharacter={profileCharacter}
          selectedProfileCharacterId={selectedProfileCharacterId}
          collectionResetTick={collectionResetTick}
          qrImageDataUrl={qrImageDataUrl}
          isPairingLoading={isPairingLoading}
          pairingError={pairingError}
          isPaired={isPaired}
          deviceName={deviceName}
          qrCharacter={nextCharacter}
          onRefreshPairing={onRefreshPairing}
          onContinueFromPaired={onContinueFromPaired}
          onProfileCharacterSelect={onProfileCharacterSelect}
          onDebugClearAcquiredCharacters={onDebugClearAcquiredCharacters}
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
    activeStartedAtMs: null,
    lastSampleAtMs: null,
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

function loadCharacterOverlayEnabled() {
  try {
    return window.localStorage.getItem(CHARACTER_OVERLAY_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveCharacterOverlayEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(
      CHARACTER_OVERLAY_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}

export default App;
