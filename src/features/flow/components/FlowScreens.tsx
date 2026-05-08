import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
  CharacterExpression,
} from "../../characters/types";
import { getCharacterImageSrc } from "../../characters/characterCatalog";
import { POSTURE_SPEC, PostureViewer } from "../../posture";
import type { RuntimeSnapshot } from "../../posture/types";
import {
  emitOverlayPlacementHintRefresh,
} from "../../overlay/overlayPlacementHintBridge";
import {
  isOverlayDebugUiEnabled,
  OVERLAY_DEBUG_UI_STORAGE_KEY,
} from "../../overlay/overlayState";
import { playSoundPreview } from "../../sound/services/recoverySound";
import {
  BUILTIN_SOUND_OPTIONS,
  type SoundSettings,
} from "../../sound/types/soundSettings";
import {
  playAcquisitionConfetti,
  playCardTapConfetti,
} from "../../../lib/playAcquisitionConfetti";
import { shareResultCapture } from "../../../lib/shareResultCapture";
import type { MeasurementResult, MeasurementStats } from "../types";

import { CharacterResultWhiteCard } from "./CharacterResultWhiteCard";

type HomeScreenProps = {
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

type CodeReadScreenProps = {
  isStartPending: boolean;
  soundSettings: SoundSettings;
  onSoundSettingsChange: (next: SoundSettings) => void;
  isCharacterOverlayEnabled: boolean;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  onStartMeasurement: () => void;
  onBackHome: () => void;
};

type MeasuringScreenProps = {
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

type PostureRegisteredScreenProps = {
  result: MeasurementResult;
  acquiredCharacter: CharacterDefinition | null;
  fallbackCharacter: CharacterDefinition | null;
  onBackHome: () => void;
};

const COLLECTION_TOTAL_COUNT = 111;
const SHOW_DEBUG_FLOW_CONTROLS = import.meta.env.DEV;

/* ─── カードチルトハンドラ（モジュールレベルで共有） ─── */

/**
 * Mouse position tracked and applied as CSS custom properties
 * so the CSS tilt transform reads them without React re-renders.
 */
function applyCardTilt(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  intensityDeg: number,
  lift: string,
) {
  const rect = el.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const x = (clientX - rect.left) / width;
  const y = (clientY - rect.top) / height;
  el.style.setProperty("--tilt-x", `${(0.5 - y) * intensityDeg}deg`);
  el.style.setProperty("--tilt-y", `${(x - 0.5) * intensityDeg}deg`);
  el.style.setProperty("--tilt-lift", lift);
  el.style.setProperty("--tilt-shine-x", `${x * 100}%`);
  el.style.setProperty("--tilt-shine-y", `${y * 100}%`);
}

function resetCardTilt(el: HTMLElement) {
  el.style.setProperty("--tilt-x", "0deg");
  el.style.setProperty("--tilt-y", "0deg");
  el.style.setProperty("--tilt-lift", "0px");
}

function onCardSlotMouseMove(e: React.MouseEvent<HTMLDivElement>) {
  applyCardTilt(e.currentTarget, e.clientX, e.clientY, 14, "-10px");
}

function onCardSlotMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
  resetCardTilt(e.currentTarget);
}

function onResultCardMouseMove(e: React.MouseEvent<HTMLElement>) {
  applyCardTilt(e.currentTarget, e.clientX, e.clientY, 5.5, "-4px");
}

function onResultCardMouseLeave(e: React.MouseEvent<HTMLElement>) {
  resetCardTilt(e.currentTarget);
}

const SHOW_DEBUG_COLLECTION_CONTROLS = SHOW_DEBUG_FLOW_CONTROLS;

const DIALOG_CLOSE_DURATION_MS = 230;

export function HomeScreen(props: HomeScreenProps) {
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isProfileDialogClosing, setIsProfileDialogClosing] = useState(false);
  const [collectionDetailCharacterId, setCollectionDetailCharacterId] = useState<
    string | null
  >(null);
  const [isCollectionDetailClosing, setIsCollectionDetailClosing] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const acquiredCharactersById = new Map(
    props.acquiredCharacters.map((character) => [
      character.characterId,
      character,
    ]),
  );
  const collectionDetailCharacter =
    collectionDetailCharacterId !== null
      ? props.characters.find(
          (character) => character.id === collectionDetailCharacterId,
        ) ?? null
      : null;
  const collectionDetailAcquiredCharacter =
    collectionDetailCharacterId !== null
      ? acquiredCharactersById.get(collectionDetailCharacterId) ?? null
      : null;

  /* ダイアログを閉じる際：アニメーション終了後にアンマウントする */
  const closeProfileDialog = useCallback(() => {
    if (isProfileDialogClosing) return;
    setIsProfileDialogClosing(true);
    setTimeout(() => {
      setIsProfileDialogOpen(false);
      setIsProfileDialogClosing(false);
    }, DIALOG_CLOSE_DURATION_MS);
  }, [isProfileDialogClosing]);

  const closeCollectionDetail = useCallback(() => {
    if (isCollectionDetailClosing) return;
    setIsCollectionDetailClosing(true);
    setTimeout(() => {
      setCollectionDetailCharacterId(null);
      setIsCollectionDetailClosing(false);
    }, DIALOG_CLOSE_DURATION_MS);
  }, [isCollectionDetailClosing]);

  useEffect(() => {
    setCollectionDetailCharacterId(null);
  }, [props.collectionResetTick]);

  return (
    <main className="flow-screen home-single">
      {/* ナビゲーションバー */}
      <nav className="home-nav">
        <FlowBrand />
        <button
          type="button"
          className="home-nav-profile"
          aria-label="プロフィールキャラクターを変更"
          onClick={() => setIsProfileDialogOpen(true)}
        >
          <CharacterFigure
            character={props.profileCharacter}
            className="home-nav-profile-character"
          />
        </button>
      </nav>

      {/* ヒーローセクション */}
      <section className="home-hero">
        {SHOW_DEBUG_FLOW_CONTROLS ? (
          <button
            type="button"
            className="home-single-debug-story"
            onClick={props.onDebugShowOnboarding}
          >
            DEBUG: ストーリー
          </button>
        ) : null}
        <div className="home-hero-content">
          <div className="home-hero-copy">
            <h1>
              良い姿勢を継続して
              <br />
              ピンアナゴをゲットしよう
            </h1>
          </div>
          <div className="home-hero-actions">
            <button
              type="button"
              className="home-hero-action-btn"
              onClick={() => setIsQrModalOpen(true)}
            >
              スマホと接続
            </button>
            <button
              type="button"
              className="home-hero-action-btn"
              onClick={props.onDebugStartMeasurement}
              disabled={props.isStartPending}
            >
              {props.isStartPending ? "登録中..." : "姿勢を測定"}
            </button>
          </div>
        </div>
        <CharacterFigure
          character={props.qrCharacter ?? props.profileCharacter}
          className="home-hero-anago"
        />
      </section>

      <CharacterCollection
        characters={props.characters}
        acquiredCharacters={props.acquiredCharacters}
        favoriteCharacterIds={props.favoriteCharacterIds}
        resetTick={props.collectionResetTick}
        onCharacterDetailOpen={setCollectionDetailCharacterId}
        onToggleFavoriteCharacter={props.onToggleFavoriteCharacter}
        onDebugClearAcquiredCharacters={props.onDebugClearAcquiredCharacters}
      />

      {/* QR接続モーダル */}
      {isQrModalOpen ? (
        <QrConnectionModal
          qrImageDataUrl={props.qrImageDataUrl}
          isPairingLoading={props.isPairingLoading}
          pairingError={props.pairingError}
          isPaired={props.isPaired}
          deviceName={props.deviceName}
          featuredCharacter={props.qrCharacter ?? props.profileCharacter}
          onRefresh={props.onRefreshPairing}
          onNext={() => {
            setIsQrModalOpen(false);
            props.onContinueFromPaired();
          }}
          onClose={() => setIsQrModalOpen(false)}
        />
      ) : null}

      {isProfileDialogOpen ? (
        <ProfileSelectionDialog
          isClosing={isProfileDialogClosing}
          characters={props.characters}
          acquiredCharacters={props.acquiredCharacters}
          selectedProfileCharacterId={props.selectedProfileCharacterId}
          onSelect={(characterId) => {
            props.onProfileCharacterSelect(characterId);
            closeProfileDialog();
          }}
          onClose={closeProfileDialog}
        />
      ) : null}
      {collectionDetailCharacter && collectionDetailAcquiredCharacter ? (
        <CollectionDetailDialog
          isClosing={isCollectionDetailClosing}
          character={collectionDetailCharacter}
          acquiredCharacter={collectionDetailAcquiredCharacter}
          onClose={closeCollectionDetail}
        />
      ) : null}
    </main>
  );
}

function buildFrame53SoundLabel(path: string) {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.mp3$|\.wav$/i, "");
}

function stopPreviewStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function CodeReadScreen({
  isStartPending,
  soundSettings,
  onSoundSettingsChange,
  isCharacterOverlayEnabled,
  onCharacterOverlayEnabledChange,
  onStartMeasurement,
  onBackHome,
}: CodeReadScreenProps) {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const volumePreviewTimerRef = useRef<number | null>(null);
  const [cameraPreview, setCameraPreview] = useState<"loading" | "live" | "error">(
    "loading",
  );

  /** 効果音量スライダー：連続ドラッグでも再生が跳ね過ぎないようディバウンス */
  function scheduleSoundVolumePreview(volume: number, selectedSrc: string) {
    if (volumePreviewTimerRef.current !== null) {
      clearTimeout(volumePreviewTimerRef.current);
    }
    volumePreviewTimerRef.current = window.setTimeout(() => {
      volumePreviewTimerRef.current = null;
      void playSoundPreview({ src: selectedSrc, volume });
    }, 220);
  }

  /* 実カメラプレビュー（測定フックとは別ストリーム。画面離脱時に停止） */
  useEffect(() => {
    let cancelled = false;

    async function attachPreview() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setCameraPreview("error");
        return;
      }

      try {
        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }).catch(() =>
            navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
          );

        if (cancelled) {
          stopPreviewStream(stream);
          return;
        }

        previewStreamRef.current = stream;
        const el = previewVideoRef.current;
        if (!el) {
          stopPreviewStream(stream);
          previewStreamRef.current = null;
          if (!cancelled) {
            setCameraPreview("error");
          }
          return;
        }

        el.srcObject = stream;
        void el.play().then(
          () => {
            if (!cancelled) {
              setCameraPreview("live");
            }
          },
          () => {
            if (!cancelled) {
              setCameraPreview("error");
            }
          },
        );
      } catch {
        if (!cancelled) {
          setCameraPreview("error");
        }
      }
    }

    void attachPreview();

    return () => {
      cancelled = true;
      stopPreviewStream(previewStreamRef.current);
      previewStreamRef.current = null;
      const el = previewVideoRef.current;
      if (el) {
        el.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (volumePreviewTimerRef.current !== null) {
        clearTimeout(volumePreviewTimerRef.current);
      }
    };
  }, []);

  /* ブランドのみのときの戻り道（画面上に戻るボタンは無いため） */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onBackHome();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackHome]);

  const soundOptionList = useMemo(() => {
    return Array.from(
      new Set([
        ...BUILTIN_SOUND_OPTIONS,
        ...soundSettings.customSounds,
      ]),
    );
  }, [soundSettings.customSounds]);

  /* Frame 53「3」姿勢登録：ユーザー提供スクショのコピーに合わせる */
  return (
    <main className="flow-screen frame53-register-screen">
      <FlowBrand />
      <div className="frame53-panels-wrap">
        <section className="frame53-left" aria-labelledby="frame53-register-heading">
          <h1 id="frame53-register-heading" className="frame53-heading">
            姿勢登録
          </h1>
          <p className="frame53-led">
            肩の力を抜いて、背筋を伸ばしてください。
          </p>
          <hr className="frame53-rule" />
          <div className="frame53-toggle-strip">
            <span
              id="frame53-switch-pin-label"
              className="frame53-toggle-strip-label"
            >
              ピンアナゴ表示
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${isCharacterOverlayEnabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={isCharacterOverlayEnabled}
              aria-labelledby="frame53-switch-pin-label"
              onClick={() =>
                onCharacterOverlayEnabledChange(!isCharacterOverlayEnabled)
              }
            >
              <span
                className="frame53-toggle-strip-switch-knob"
                aria-hidden
              />
            </button>
          </div>
          <div className="frame53-toggle-strip">
            <span
              id="frame53-switch-sound-label"
              className="frame53-toggle-strip-label"
            >
              サウンド
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${soundSettings.enabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={soundSettings.enabled}
              aria-labelledby="frame53-switch-sound-label"
              onClick={() =>
                onSoundSettingsChange({
                  ...soundSettings,
                  enabled: !soundSettings.enabled,
                })
              }
            >
              <span
                className="frame53-toggle-strip-switch-knob"
                aria-hidden
              />
            </button>
          </div>

          <div
            className={`frame53-sound-card ${!soundSettings.enabled ? "frame53-muted" : ""}`}
          >
            <label className="frame53-volume-row" htmlFor="frame53-volume">
              <span className="frame53-volume-visible-label">音量</span>
              <input
                id="frame53-volume"
                className="frame53-volume-range"
                type="range"
                min={0}
                max={100}
                value={Math.round(soundSettings.volume * 100)}
                style={{
                  ["--frame53-volume-pct" as string]: `${Math.round(soundSettings.volume * 100)}%`,
                }}
                onChange={(e) => {
                  const volume = Number(e.target.value) / 100;
                  onSoundSettingsChange({
                    ...soundSettings,
                    volume,
                  });
                  scheduleSoundVolumePreview(
                    volume,
                    soundSettings.selectedSound,
                  );
                }}
              />
            </label>
            <p className="frame53-sfx-label">効果音</p>
            <div className="frame53-sfx-shell">
              <select
                className="frame53-sfx-select"
                aria-label="効果音の種類"
                value={soundSettings.selectedSound}
                onChange={(e) => {
                  const selectedSound = e.target.value;
                  onSoundSettingsChange({
                    ...soundSettings,
                    selectedSound,
                  });
                  void playSoundPreview({
                    src: selectedSound,
                    volume: soundSettings.volume,
                  });
                }}
              >
                {soundOptionList.map((option) => (
                  <option key={option} value={option}>
                    {buildFrame53SoundLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="frame53-footer">
            <button
              type="button"
              className="frame53-primary"
              onClick={onStartMeasurement}
              disabled={isStartPending}
            >
              {isStartPending ? "準備中…" : "はじめる"}
            </button>
          </div>
        </section>
        <section
          className="frame53-camera-panel"
          aria-label="カメラプレビュー"
        >
          <video
            ref={previewVideoRef}
            className="frame53-camera-video"
            playsInline
            muted
            aria-hidden="true"
          />
          {cameraPreview !== "live" ? (
            <p
              className="frame53-camera-overlay-text"
              aria-live="polite"
            >
              {cameraPreview === "error"
                ? "カメラを開始できません"
                : "カメラ"}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export function MeasuringScreen({
  videoRef,
  canvasRef,
  snapshot,
  stats,
  isBadPosture,
  isPaused,
  isOverlayEnabled,
  isCharacterOverlayEnabled,
  soundSettings,
  onSoundSettingsChange,
  onFinishMeasurement,
  onPauseToggle,
  onOverlayEnabledChange,
  onCharacterOverlayEnabledChange,
  onShowCharacterOverlay,
  onResetCharacterPosition,
}: MeasuringScreenProps) {
  const isWarmup = !snapshot.baselineReady;
  const warmupSeconds = Math.max(
    0,
    Math.ceil(snapshot.warmupRemainingMs / 1000),
  );

  const showMeasureDevTools =
    import.meta.env.DEV || isOverlayDebugUiEnabled();

  const volumePreviewTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (volumePreviewTimerRef.current !== null) {
        clearTimeout(volumePreviewTimerRef.current);
      }
    };
  }, []);

  function scheduleMeasureVolumePreview(volume: number, selectedSrc: string) {
    if (volumePreviewTimerRef.current !== null) {
      clearTimeout(volumePreviewTimerRef.current);
    }
    volumePreviewTimerRef.current = window.setTimeout(() => {
      volumePreviewTimerRef.current = null;
      void playSoundPreview({ src: selectedSrc, volume });
    }, 220);
  }

  const soundOptionList = useMemo(() => {
    return Array.from(
      new Set([...BUILTIN_SOUND_OPTIONS, ...soundSettings.customSounds]),
    );
  }, [soundSettings.customSounds]);

  const [placementHintEmitNotice, setPlacementHintEmitNotice] = useState<
    "ok" | "fail" | null
  >(null);
  const placementHintEmitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (placementHintEmitTimerRef.current !== null) {
        window.clearTimeout(placementHintEmitTimerRef.current);
      }
    };
  }, []);

  async function handleEmitOverlayPlacementHintRefresh() {
    if (placementHintEmitTimerRef.current !== null) {
      window.clearTimeout(placementHintEmitTimerRef.current);
    }
    const ok = await emitOverlayPlacementHintRefresh();
    setPlacementHintEmitNotice(ok ? "ok" : "fail");
    placementHintEmitTimerRef.current = window.setTimeout(() => {
      setPlacementHintEmitNotice(null);
      placementHintEmitTimerRef.current = null;
    }, 3400);
  }

  const headingId = "measuring-heading";
  const title = isWarmup
    ? "基準姿勢を測定中"
    : isPaused
      ? "一時停止中"
      : "測定中";

  const gaugePercent = isWarmup
    ? 0
    : Math.round(Math.min(1, Math.max(0, stats.goodRatio)) * 100);
  const stopDisabled =
    !snapshot.baselineReady || stats.activeMeasurementMs <= 0;
  const pauseDisabled = isWarmup;

  return (
    <main className="flow-screen measuring-screen">
      <FlowBrand />
      <section className="measure-layout" aria-labelledby={headingId}>
        <aside className="measure-control-card" aria-label="測定コントロール">
          <header className="measure-control-head">
            <div>
              <h1 id={headingId} className="measure-control-title">
                {title}
              </h1>
            </div>
            <div className="measure-control-icon-actions">
              <button
                type="button"
                className={`measure-icon-btn measure-icon-btn--pause ${isPaused ? "is-resume" : ""}`}
                onClick={onPauseToggle}
                disabled={pauseDisabled}
                aria-label={isPaused ? "再開" : "一時停止"}
              >
                {isPaused ? (
                  <MeasurePlayIcon />
                ) : (
                  <MeasurePauseIcon />
                )}
              </button>
              <button
                type="button"
                className="measure-icon-btn measure-icon-btn--stop"
                onClick={onFinishMeasurement}
                disabled={stopDisabled}
                aria-label="測定終了"
              >
                <MeasureStopIcon />
              </button>
            </div>
          </header>

          <div className="measure-metrics-row">
            <MetricTile
              label={isWarmup ? "測定開始まで" : "測定時間"}
              value={
                isWarmup ? `${warmupSeconds}s` : formatDuration(stats.activeMeasurementMs)
              }
            />
            <MetricTile
              label="良い姿勢率"
              value={
                isWarmup ? "—" : formatPercent(stats.goodRatio)
              }
            />
          </div>

          <div className="frame53-toggle-strip">
            <span
              id="measure-pin-label"
              className="frame53-toggle-strip-label"
            >
              ピンアナゴ表示
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${isCharacterOverlayEnabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={isCharacterOverlayEnabled}
              aria-labelledby="measure-pin-label"
              onClick={() =>
                onCharacterOverlayEnabledChange(!isCharacterOverlayEnabled)
              }
            >
              <span className="frame53-toggle-strip-switch-knob" aria-hidden />
            </button>
          </div>

          <div className="frame53-toggle-strip">
            <span
              id="measure-sound-label"
              className="frame53-toggle-strip-label"
            >
              サウンド
            </span>
            <button
              type="button"
              className={`frame53-toggle-strip-switch ${soundSettings.enabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={soundSettings.enabled}
              aria-labelledby="measure-sound-label"
              onClick={() =>
                onSoundSettingsChange({
                  ...soundSettings,
                  enabled: !soundSettings.enabled,
                })
              }
            >
              <span className="frame53-toggle-strip-switch-knob" aria-hidden />
            </button>
          </div>

          <div
            className={`frame53-sound-card ${!soundSettings.enabled ? "frame53-muted" : ""}`}
          >
            <label className="frame53-volume-row" htmlFor="measure-volume">
              <span className="frame53-volume-visible-label">音量</span>
              <input
                id="measure-volume"
                className="frame53-volume-range"
                type="range"
                min={0}
                max={100}
                value={Math.round(soundSettings.volume * 100)}
                style={{
                  ["--frame53-volume-pct" as string]: `${Math.round(soundSettings.volume * 100)}%`,
                }}
                onChange={(e) => {
                  const volume = Number(e.target.value) / 100;
                  onSoundSettingsChange({
                    ...soundSettings,
                    volume,
                  });
                  scheduleMeasureVolumePreview(volume, soundSettings.selectedSound);
                }}
              />
            </label>
            <p className="frame53-sfx-label">効果音</p>
            <div className="frame53-sfx-shell">
              <select
                className="frame53-sfx-select"
                aria-label="効果音の種類"
                value={soundSettings.selectedSound}
                onChange={(e) => {
                  const selectedSound = e.target.value;
                  onSoundSettingsChange({
                    ...soundSettings,
                    selectedSound,
                  });
                  void playSoundPreview({
                    src: selectedSound,
                    volume: soundSettings.volume,
                  });
                }}
              >
                {soundOptionList.map((option) => (
                  <option key={option} value={option}>
                    {buildFrame53SoundLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showMeasureDevTools ? (
            <div className="measure-debug-tools">
              <p className="measure-debug-tools-label">開発・検証</p>
              <div className="frame53-toggle-strip measure-debug-overlay-row">
                <span
                  id="measure-dev-overlay-label"
                  className="frame53-toggle-strip-label"
                >
                  ライン表示
                </span>
                <button
                  type="button"
                  className={`frame53-toggle-strip-switch ${isOverlayEnabled ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={isOverlayEnabled}
                  aria-labelledby="measure-dev-overlay-label"
                  onClick={() => onOverlayEnabledChange(!isOverlayEnabled)}
                >
                  <span className="frame53-toggle-strip-switch-knob" aria-hidden />
                </button>
              </div>
              {!isCharacterOverlayEnabled ? (
                <button type="button" className="tool-pill" onClick={onShowCharacterOverlay}>
                  キャラ表示
                </button>
              ) : null}
              <button
                type="button"
                className="tool-pill measure-tool-overlay-hint-debug"
                title={`クリックでデスクトップオーバーレイへ配置ヒント再表示を送る（${OVERLAY_DEBUG_UI_STORAGE_KEY}）`}
                onClick={() => void handleEmitOverlayPlacementHintRefresh()}
              >
                配置ヒント(debug)
              </button>
              <button type="button" className="tool-pill" onClick={onResetCharacterPosition}>
                位置リセット
              </button>
              {placementHintEmitNotice ? (
                <p
                  className={`measure-placement-hint-emit-feedback measure-placement-hint-emit-feedback--${placementHintEmitNotice}`}
                  role="status"
                >
                  {placementHintEmitNotice === "ok"
                    ? "配置ヒントをオーバーレイへ送りました。画面右下のキャラ付近を確認してください。"
                    : "送信できませんでした（ブラウザでは Tauri がありません）。"}
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>

        <div className="measure-camera-panel measure-camera-panel--figma">
          <div className="measure-camera-stack">
            <div
              className={`measure-posture-gauge ${isWarmup ? "measure-posture-gauge--warmup" : ""}`}
              aria-hidden={isWarmup}
            >
              <span className="measure-posture-gauge-end measure-posture-gauge-end--bad">
                悪い
              </span>
              <div className="measure-posture-gauge-track">
                <div
                  className="measure-posture-gauge-fill"
                  style={{ width: `${gaugePercent}%` }}
                />
              </div>
              <span className="measure-posture-gauge-end measure-posture-gauge-end--good">
                良い
              </span>
            </div>
            <PostureViewer
              variant="measurement"
              videoRef={videoRef}
              canvasRef={canvasRef}
              isBadPosture={isBadPosture}
              isOverlayEnabled={isOverlayEnabled}
              isCharacterOverlayEnabled={isCharacterOverlayEnabled}
              experiment={snapshot.experiment}
              onOverlayEnabledChange={onOverlayEnabledChange}
              onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
            />
            {isWarmup ? (
              <WarmupCountdownVeil
                remainingMs={snapshot.warmupRemainingMs}
                totalMs={POSTURE_SPEC.warmupMs}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

export function PostureRegisteredScreen({
  result,
  acquiredCharacter,
  fallbackCharacter: _fallbackCharacter,
  onBackHome,
}: PostureRegisteredScreenProps) {
  const wasSuccessful =
    Boolean(result.rewardQualified) && acquiredCharacter !== null;
  const timelineVariant = wasSuccessful ? "success" : "fail";

  const shareCaptureRef = useRef<HTMLElement>(null);
  const resultCardEnterTimerRef = useRef<number | null>(null);
  const resultCardTapFrameRef = useRef<number | null>(null);
  const resultCardTapResetTimerRef = useRef<number | null>(null);
  const [isResultCardEntering, setIsResultCardEntering] = useState(false);
  const [isResultCardTapped, setIsResultCardTapped] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const displayCharacter = wasSuccessful ? acquiredCharacter : null;
  const personalityTags = wasSuccessful
    ? (
        displayCharacter !== null && displayCharacter.personalityTags.length > 0
          ? displayCharacter.personalityTags.slice(0, 2)
          : ["？？？？？", "？？？？？"]
      )
    : (["？？？？？", "？？？？？"] as const);

  /** キャラ primary / soft でアクセントを上書き（クラスのフォールバック値より優先） */
  const characterThemeVars = useMemo(() => {
    if (!wasSuccessful || acquiredCharacter === null) {
      return undefined;
    }
    return {
      "--result-stat-accent": acquiredCharacter.characterColor.primary,
      "--result-share-icon": acquiredCharacter.characterColor.primary,
      "--result-meta-icon": acquiredCharacter.characterColor.primary,
      "--result-portrait-bg": acquiredCharacter.characterColor.soft,
      "--result-timeline-good": acquiredCharacter.characterColor.primary,
    } as CSSProperties;
  }, [wasSuccessful, acquiredCharacter]);

  /** 共有キャプチャ対象（白カード）に必要な色変数を直接注入する */
  const shareCardThemeVars = useMemo(() => {
    if (wasSuccessful && acquiredCharacter !== null) {
      return {
        "--result-stat-accent": acquiredCharacter.characterColor.primary,
        "--result-share-icon": acquiredCharacter.characterColor.primary,
        "--result-meta-icon": acquiredCharacter.characterColor.primary,
        "--result-portrait-bg": acquiredCharacter.characterColor.soft,
        "--result-timeline-good": acquiredCharacter.characterColor.primary,
      } as CSSProperties;
    }
    return {
      "--result-stat-accent": "#8a9399",
      "--result-share-icon": "#8a9399",
      "--result-meta-icon": "#8a9399",
      "--result-portrait-bg": "#eceff1",
      "--result-timeline-good": "#8a9399",
    } as CSSProperties;
  }, [wasSuccessful, acquiredCharacter]);

  const handleShareResult = useCallback(async () => {
    if (
      shareCaptureRef.current === null ||
      shareBusy
    ) {
      return;
    }
    setShareBusy(true);
    setShareFeedback(null);
    try {
      const outcome = await shareResultCapture(shareCaptureRef.current);
      if (outcome === "downloaded") {
        const msg = "画像をダウンロードしました";
        setShareFeedback(msg);
        window.setTimeout(() => {
          setShareFeedback((current) => (current === msg ? null : current));
        }, 4200);
      } else if (outcome === "copied") {
        const msg = "画像をクリップボードにコピーしました";
        setShareFeedback(msg);
        window.setTimeout(() => {
          setShareFeedback((current) => (current === msg ? null : current));
        }, 4200);
      } else if (outcome === "shared") {
        setShareFeedback(null);
      }
    } catch {
      setShareFeedback("共有に失敗しました。もう一度お試しください。");
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy]);

  useEffect(() => {
    return () => {
      if (resultCardEnterTimerRef.current !== null) {
        window.clearTimeout(resultCardEnterTimerRef.current);
      }
      if (resultCardTapFrameRef.current !== null) {
        window.cancelAnimationFrame(resultCardTapFrameRef.current);
      }
      if (resultCardTapResetTimerRef.current !== null) {
        window.clearTimeout(resultCardTapResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (resultCardEnterTimerRef.current !== null) {
      window.clearTimeout(resultCardEnterTimerRef.current);
      resultCardEnterTimerRef.current = null;
    }

    if (!wasSuccessful) {
      setIsResultCardEntering(false);
      return;
    }

    setIsResultCardEntering(true);
    resultCardEnterTimerRef.current = window.setTimeout(() => {
      setIsResultCardEntering(false);
      resultCardEnterTimerRef.current = null;
    }, 760);
  }, [wasSuccessful, result.id]);

  const handleResultCardTap = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!wasSuccessful || acquiredCharacter === null) {
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest("button")
    ) {
      return;
    }

    const cardElement = event.currentTarget;
    const rect = cardElement.getBoundingClientRect();
    const clickX = event.clientX || rect.left + rect.width / 2;
    const clickY = event.clientY || rect.top + rect.height / 2;

    playCardTapConfetti({
      clientX: clickX,
      clientY: clickY,
      elementWidth: rect.width,
      elementHeight: rect.height,
      characterColors: acquiredCharacter.characterColor,
    });

    setIsResultCardTapped(false);
    if (resultCardTapFrameRef.current !== null) {
      window.cancelAnimationFrame(resultCardTapFrameRef.current);
    }
    resultCardTapFrameRef.current = window.requestAnimationFrame(() => {
      setIsResultCardTapped(true);
      resultCardTapFrameRef.current = null;
    });

    if (resultCardTapResetTimerRef.current !== null) {
      window.clearTimeout(resultCardTapResetTimerRef.current);
    }
    resultCardTapResetTimerRef.current = window.setTimeout(() => {
      setIsResultCardTapped(false);
      resultCardTapResetTimerRef.current = null;
    }, 520);
  }, [wasSuccessful, acquiredCharacter]);

  useEffect(() => {
    if (!wasSuccessful) {
      return;
    }
    playAcquisitionConfetti(
      acquiredCharacter !== null
        ? { characterColors: acquiredCharacter.characterColor }
        : undefined,
    );
  }, [acquiredCharacter, wasSuccessful, result.id]);

  return (
    <main
      className={`flow-screen result-screen result-screen--registered result-screen--accent-${timelineVariant}`}
      style={characterThemeVars}
    >
      <FlowBrand />

      <div className="result-registered-capture-root">
        <header className="result-registered-hero" aria-labelledby="registered-heading">
          <p className="result-registered-eyebrow">今日のピンアナゴ</p>
          <h1
            id="registered-heading"
            className={`result-registered-title ${wasSuccessful ? "" : "is-fail"}`}
          >
            {wasSuccessful ? "獲得" : "獲得ならず…"}
          </h1>
        </header>

        <CharacterResultWhiteCard
          ref={shareCaptureRef}
          portraitMode={wasSuccessful ? "character" : "qr-fail"}
          character={displayCharacter}
          personalityTags={personalityTags}
          goodDurationLabel={formatDuration(result.goodMs)}
          goodRatioLabel={formatPercent(result.goodRatio)}
          timelineSegments={result.postureTimeline}
          timelineTotalMs={result.activeMeasurementMs}
          timelineVariant={timelineVariant}
          timelineGoodStrokeResolved={
            wasSuccessful && acquiredCharacter !== null
              ? acquiredCharacter.characterColor.primary
              : "#8a9399"
          }
          acquiredAtLabel={formatAcquiredAt(result.endedAt)}
          measurementDurationLabel={formatDuration(result.activeMeasurementMs)}
          shareBusy={shareBusy}
          onShareClick={() => {
            void handleShareResult();
          }}
          articleClassName={`${wasSuccessful ? "result-registered-card--acquired" : ""} ${
            isResultCardEntering ? "is-entering" : ""
          } ${
            isResultCardTapped ? "is-tapped" : ""
          }`.trim()}
          articleStyle={shareCardThemeVars}
          onArticleClick={handleResultCardTap}
          onArticleMouseMove={wasSuccessful ? onResultCardMouseMove : undefined}
          onArticleMouseLeave={wasSuccessful ? onResultCardMouseLeave : undefined}
        />
      </div>

      <p
        className="result-registered-share-feedback"
        role="status"
        aria-live="polite"
      >
        {shareFeedback ?? ""}
      </p>

      <footer className="result-registered-footer">
        <button
          type="button"
          className={`result-registered-home ${wasSuccessful ? "is-acquired" : "is-miss"}`}
          onClick={onBackHome}
        >
          ホーム
        </button>
      </footer>
    </main>
  );
}

function FlowBrand() {
  return (
    <div className="flow-brand">
      <img
        className="flow-brand-logo"
        src="/logo/logo_white.png"
        alt="Pinn"
        draggable={false}
      />
    </div>
  );
}

function QrConnectionModal({
  qrImageDataUrl,
  isPairingLoading,
  pairingError,
  isPaired,
  deviceName: _deviceName,
  featuredCharacter,
  onRefresh,
  onNext,
  onClose,
}: {
  qrImageDataUrl: string;
  isPairingLoading: boolean;
  pairingError: string | null;
  isPaired: boolean;
  deviceName: string | null;
  featuredCharacter: CharacterDefinition | null;
  onRefresh: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  /* Figma Frame 53：1 = QR／接続済みでも 次へ で 2 へ進む（自動で飛ばさない） */
  const [debugForceStep2, setDebugForceStep2] = useState(false);
  const [pairedAdvanceToStep2, setPairedAdvanceToStep2] = useState(false);

  useEffect(() => {
    if (!isPaired) {
      setPairedAdvanceToStep2(false);
    }
  }, [isPaired]);

  const step: 1 | 2 =
    SHOW_DEBUG_FLOW_CONTROLS && debugForceStep2
      ? 2
      : isPaired && pairedAdvanceToStep2
        ? 2
        : 1;
  const nextDisabled = step === 1 && !isPaired;
  /* 見た目だけのサウンド＆触覚トグル（機能なし） */
  const [soundHapticOn, setSoundHapticOn] = useState(true);

  return (
    <div className="qr-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="qr-modal-heading">
      <div className="qr-modal-brand">
        <FlowBrand />
      </div>
      <button
        type="button"
        className="qr-modal-close"
        onClick={onClose}
        aria-label="閉じる"
      >
        ×
      </button>
      <div className="qr-modal-panels">
        <div className={`qr-modal-left qr-modal-left--step${step}`}>
          {step === 1 ? (
            <>
              <h2 id="qr-modal-heading" className="qr-modal-title">
                スマホと接続
              </h2>
              <p className="qr-modal-subtitle">
                スマートフォンでQRを読み込んでください
              </p>
              <div className="qr-modal-phone-area">
                <img
                  src="/phone_QR.png"
                  alt=""
                  className="qr-modal-phone-img"
                  draggable={false}
                  aria-hidden="true"
                />
              </div>
              {pairingError ? (
                <p className="qr-modal-error-label">{pairingError}</p>
              ) : null}
            </>
          ) : (
            <>
              <h2 id="qr-modal-heading" className="qr-modal-title">
                接続完了
              </h2>
              <p className="qr-modal-subtitle">
                スマホの触覚をONにしてください
              </p>
              <div className="qr-modal-sound-haptic-toggle-row">
                <span className="qr-modal-sound-haptic-toggle-label" id="qr-haptic-toggle-label">
                  サウンドと触覚
                </span>
                <button
                  type="button"
                  className={`qr-modal-sound-haptic-switch ${soundHapticOn ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={soundHapticOn}
                  aria-labelledby="qr-haptic-toggle-label"
                  onClick={() => setSoundHapticOn((v) => !v)}
                >
                  {/* 視覚のノブ（意味は状態のみ） */}
                  <span className="qr-modal-sound-haptic-switch-knob" aria-hidden />
                </button>
              </div>
              <div className="qr-modal-vibe-area">
                <div className="qr-modal-vibe-stage">
                  <span
                    className="qr-modal-vibe-arcs qr-modal-vibe-arcs--left"
                    aria-hidden="true"
                  >
                    {/* 触覚波紋（左）：3本のアーチを順に出してリップル感を出す */}
                    <svg
                      viewBox="0 0 40 80"
                      fill="none"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <path d="M34 8 C 14 26 14 54 34 72" />
                      <path d="M24 16 C 10 30 10 50 24 64" />
                      <path d="M14 24 C 6 34 6 46 14 56" />
                    </svg>
                  </span>
                  <img
                    src="/phone.png"
                    alt=""
                    className="qr-modal-vibe-img"
                    draggable={false}
                    aria-hidden="true"
                  />
                  <span
                    className="qr-modal-vibe-arcs qr-modal-vibe-arcs--right"
                    aria-hidden="true"
                  >
                    {/* 触覚波紋（右） */}
                    <svg
                      viewBox="0 0 40 80"
                      fill="none"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <path d="M6 8 C 26 26 26 54 6 72" />
                      <path d="M16 16 C 30 30 30 50 16 64" />
                      <path d="M26 24 C 34 34 34 46 26 56" />
                    </svg>
                  </span>
                </div>
              </div>
            </>
          )}
          <button
            type="button"
            className="qr-modal-next-btn"
            onClick={() => {
              if (nextDisabled) {
                return;
              }
              if (step === 1 && isPaired) {
                setPairedAdvanceToStep2(true);
                return;
              }
              onNext();
            }}
            disabled={nextDisabled}
          >
            次へ
          </button>
        </div>

        {step === 1 ? (
          <div className="qr-modal-right-col">
            <div className="qr-modal-right qr-modal-right--step1">
              <div className="qr-modal-qr-stack">
                {/*
                  Figma 「1」奥→手前：①step1半透明フロスト（余白〜角丸）
                  →②白(#fff)→③グレーアナゴ→④QR／Frame44 インナー99／QR約483中央
                */}
                <div className="qr-modal-qr-composite">
                  <div className="qr-modal-qr-white-mat" aria-hidden />
                  <img
                    src="/logo/QRアナゴ.png"
                    alt=""
                    className="qr-modal-qr-anago-behind"
                    draggable={false}
                    aria-hidden="true"
                  />
                  {qrImageDataUrl ? (
                    <img
                      src={qrImageDataUrl}
                      alt="ペアリングQRコード"
                      className="qr-modal-qr-image"
                    />
                  ) : (
                    <div className="qr-modal-qr-placeholder">
                      {isPairingLoading ? "QR準備中..." : "QRを表示できません"}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {qrImageDataUrl ? (
              <button
                type="button"
                className="qr-modal-refresh-btn"
                onClick={onRefresh}
              >
                QRを更新
              </button>
            ) : null}
          </div>
        ) : (
          <div className="qr-modal-right-col qr-modal-right-col--step2">
            <div className="qr-modal-right qr-modal-right--step2">
              {/*
                本会話での「今日のアナゴ」に相当する、今回解禁予定キャラの予告エリア。
                サイズ・位置は home.css の .qr-modal-right--step2 内の
                --qr-today-heading-cqw 等を開発者が直接変更して確定させる。
              */}
              <div id="qr-today-teaser" className="qr-modal-today-teaser">
                <p className="qr-modal-today-heading">今日のピンアナゴ</p>
                <div className="qr-modal-today-character qr-modal-today-character--animated">
                  <CharacterFigure
                    character={featuredCharacter}
                    className="qr-modal-today-character-img"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {SHOW_DEBUG_FLOW_CONTROLS ? (
        <div className="qr-modal-debug-actions">
          <button
            type="button"
            className="home-single-debug-skip qr-modal-debug-skip"
            onClick={onNext}
          >
            DEBUG: QRスキップ
          </button>
          <button
            type="button"
            className="home-single-debug-skip qr-modal-debug-step2"
            onClick={() => setDebugForceStep2((v) => !v)}
          >
            DEBUG: Step2 {debugForceStep2 ? "OFF" : "プレビュー"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CharacterCollection({
  characters,
  acquiredCharacters,
  favoriteCharacterIds,
  resetTick,
  onCharacterDetailOpen,
  onToggleFavoriteCharacter,
  onDebugClearAcquiredCharacters,
}: {
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  favoriteCharacterIds: Set<string>;
  resetTick: number;
  onCharacterDetailOpen: (characterId: string) => void;
  onToggleFavoriteCharacter: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
}) {
  const [debugResetMessage, setDebugResetMessage] = useState<string | null>(
    null,
  );
  const [isDebugResetConfirming, setIsDebugResetConfirming] = useState(false);
  const acquiredCharactersById = new Map(
    acquiredCharacters.map((character) => [character.characterId, character]),
  );
  const collectionSlots = Array.from(
    { length: COLLECTION_TOTAL_COUNT },
    (_, index) => {
      const character = characters[index] ?? null;

      return {
        character,
        acquiredCharacter:
          character !== null
            ? acquiredCharactersById.get(character.id) ?? null
            : null,
        number: index + 1,
      };
    },
  );
  const acquiredCount = collectionSlots.filter(
    (slot) => slot.acquiredCharacter !== null,
  ).length;

  useEffect(() => {
    setDebugResetMessage(null);
    setIsDebugResetConfirming(false);
  }, [resetTick]);

  useEffect(() => {
    if (!debugResetMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebugResetMessage(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [debugResetMessage]);

  useEffect(() => {
    if (!isDebugResetConfirming) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsDebugResetConfirming(false);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [isDebugResetConfirming]);

  return (
    <section className="home-collection" aria-labelledby="collection-heading">
      <div className="home-collection-heading">
        <h2 id="collection-heading">コレクション</h2>
        <strong className="home-collection-count">
          {acquiredCount}
          <span> / {COLLECTION_TOTAL_COUNT}</span>
        </strong>
        {SHOW_DEBUG_COLLECTION_CONTROLS ? (
          <button
            type="button"
            className={`home-collection-debug-reset ${
              isDebugResetConfirming ? "is-confirming" : ""
            }`}
            onClick={() => {
              if (!isDebugResetConfirming) {
                setIsDebugResetConfirming(true);
                setDebugResetMessage("もう一度押すと削除");
                return;
              }

              onDebugClearAcquiredCharacters();
              setIsDebugResetConfirming(false);
              setDebugResetMessage("削除しました");
            }}
          >
            {isDebugResetConfirming
              ? "DEBUG: もう一度押す"
              : "DEBUG: 習得データ削除"}
          </button>
        ) : null}
        {debugResetMessage ? (
          <span className="home-collection-debug-message" role="status">
            {debugResetMessage}
          </span>
        ) : null}
      </div>
      <div className="home-collection-grid">
        {collectionSlots.map(({ character, acquiredCharacter, number }, index) => {
          /* スタッガー遅延：最初の数行だけ段階的に出現させ、それ以降はまとめて表示 */
          const animDelayMs = Math.min(index * 28, 280);

          if (character === null || acquiredCharacter === null) {
            return (
              <article
                key={`locked-${number}`}
                className="home-character-card is-locked"
                aria-label={`未習得キャラクター ${formatCollectionNumber(number)}`}
                style={{ "--card-anim-delay": `${animDelayMs}ms` } as CSSProperties}
              >
                <span className="home-locked-slot">
                  {formatCollectionNumber(number)}
                </span>
              </article>
            );
          }

          const cardStyle = {
            "--home-character-color": character.characterColor.primary,
            "--home-character-soft-color": character.characterColor.soft,
            "--card-anim-delay": `${animDelayMs}ms`,
          } as CSSProperties;
          const isFavorite = favoriteCharacterIds.has(character.id);

          return (
            <div
              className="home-character-slot"
              key={character.id}
              style={cardStyle}
              onMouseMove={onCardSlotMouseMove}
              onMouseLeave={onCardSlotMouseLeave}
            >
              <button
                type="button"
                className="home-character-card is-acquired"
                onClick={() => onCharacterDetailOpen(character.id)}
              >
                <div className="home-character-preview">
                  <CharacterFigure character={character} className="home-card-character" />
                </div>
                <div className="home-character-body">
                  <h3 className="home-character-name">{character.name}</h3>
                  <div className="home-character-tags">
                    {character.personalityTags.map((tag) => (
                      <span className="home-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
              <button
                type="button"
                className={`home-favorite-heart ${isFavorite ? "is-active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavoriteCharacter(character.id);
                }}
                aria-pressed={isFavorite}
                aria-label={
                  isFavorite
                    ? `${character.name}をお気に入りから外す`
                    : `${character.name}をお気に入りに追加`
                }
              >
                <span aria-hidden="true">{isFavorite ? "♥" : "♡"}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CollectionDetailDialog({
  isClosing,
  character,
  acquiredCharacter,
  onClose,
}: {
  isClosing: boolean;
  character: CharacterDefinition;
  acquiredCharacter: AcquiredCharacter;
  onClose: () => void;
}) {
  const shareCaptureRef = useRef<HTMLElement>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const hasTimelineData =
    (acquiredCharacter.postureTimeline?.length ?? 0) > 0 &&
    (acquiredCharacter.activeMeasurementMs ?? 0) > 0;
  const timelineVariant = hasTimelineData ? "success" : "fail";

  const shareCardThemeVars = useMemo(() => {
    return {
      "--result-stat-accent": character.characterColor.primary,
      "--result-share-icon": character.characterColor.primary,
      "--result-meta-icon": character.characterColor.primary,
      "--result-portrait-bg": character.characterColor.soft,
      "--result-timeline-good": character.characterColor.primary,
    } as CSSProperties;
  }, [character]);

  const handleShareCollection = useCallback(async () => {
    if (shareCaptureRef.current === null || shareBusy) {
      return;
    }
    setShareBusy(true);
    setShareFeedback(null);
    try {
      const outcome = await shareResultCapture(shareCaptureRef.current);
      if (outcome === "downloaded") {
        setShareFeedback("画像をダウンロードしました");
      } else if (outcome === "copied") {
        setShareFeedback("画像をクリップボードにコピーしました");
      } else {
        setShareFeedback(null);
      }
    } catch {
      setShareFeedback("共有に失敗しました。もう一度お試しください。");
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy]);

  return (
    <section
      className={`collection-detail-backdrop${isClosing ? " is-closing" : ""}`}
      role="presentation"
      onMouseDown={isClosing ? undefined : onClose}
    >
      <div
        className="collection-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-detail-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="collection-detail-header">
          <p className="collection-detail-eyebrow">今日のピンアナゴ</p>
          <button
            type="button"
            className="collection-detail-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <CharacterResultWhiteCard
          ref={shareCaptureRef}
          portraitMode="character"
          character={character}
          personalityTags={character.personalityTags}
          goodDurationLabel={formatOptionalDuration(acquiredCharacter.goodMs)}
          goodRatioLabel={formatOptionalPercent(acquiredCharacter.goodRatio)}
          timelineSegments={acquiredCharacter.postureTimeline ?? []}
          timelineTotalMs={acquiredCharacter.activeMeasurementMs ?? 0}
          timelineVariant={timelineVariant}
          timelineGoodStrokeResolved={
            hasTimelineData ? character.characterColor.primary : "#8a9399"
          }
          acquiredAtLabel={formatAcquiredAt(acquiredCharacter.acquiredAt)}
          measurementDurationLabel={formatOptionalDuration(
            acquiredCharacter.activeMeasurementMs,
          )}
          shareBusy={shareBusy}
          onShareClick={() => {
            void handleShareCollection();
          }}
          articleStyle={shareCardThemeVars}
          characterNameId="collection-detail-heading"
        />
        <div
          className="collection-detail-story-below"
          aria-labelledby="collection-detail-story-heading"
        >
          <h3 id="collection-detail-story-heading">ストーリー</h3>
          <p className="collection-detail-story">{character.story}</p>
        </div>
        <p className="collection-detail-share-feedback" role="status" aria-live="polite">
          {shareFeedback ?? ""}
        </p>
      </div>
    </section>
  );
}

function ProfileSelectionDialog({
  isClosing,
  characters,
  acquiredCharacters,
  selectedProfileCharacterId,
  onSelect,
  onClose,
}: {
  isClosing: boolean;
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  selectedProfileCharacterId: string | null;
  onSelect: (characterId: string) => void;
  onClose: () => void;
}) {
  const selectableCharacters = getAcquiredCharacterDefinitions(
    characters,
    acquiredCharacters,
  );

  return (
    <section
      className={`profile-dialog-backdrop${isClosing ? " is-closing" : ""}`}
      role="presentation"
      onMouseDown={isClosing ? undefined : onClose}
    >
      <div
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-dialog-header">
          <h2 id="profile-dialog-heading">プロフィール</h2>
          <button
            type="button"
            className="profile-dialog-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {selectableCharacters.length > 0 ? (
          <div className="profile-selection-grid">
            {selectableCharacters.map((character) => {
              const selected = character.id === selectedProfileCharacterId;
              const itemStyle = {
                "--home-character-color": character.characterColor.primary,
                "--home-character-soft-color": character.characterColor.soft,
              } as CSSProperties;

              return (
                <button
                  type="button"
                  key={character.id}
                  className={`profile-selection-item ${selected ? "is-selected" : ""}`}
                  style={itemStyle}
                  aria-pressed={selected}
                  onClick={() => onSelect(character.id)}
                >
                  <span className="profile-selection-preview">
                    <CharacterFigure
                      character={character}
                      className="profile-selection-character"
                    />
                  </span>
                  <span className="profile-selection-name">{character.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="profile-selection-empty">
            まだピンアナゴを習得していません
          </p>
        )}
      </div>
    </section>
  );
}

function getAcquiredCharacterDefinitions(
  characters: CharacterDefinition[],
  acquiredCharacters: AcquiredCharacter[],
) {
  const charactersById = new Map(
    characters.map((character) => [character.id, character]),
  );
  const seenCharacterIds = new Set<string>();

  return acquiredCharacters
    .map((acquiredCharacter) => {
      if (seenCharacterIds.has(acquiredCharacter.characterId)) {
        return null;
      }

      seenCharacterIds.add(acquiredCharacter.characterId);
      return charactersById.get(acquiredCharacter.characterId) ?? null;
    })
    .filter((character): character is CharacterDefinition => character !== null);
}

function CharacterFigure({
  character,
  className,
  expression,
}: {
  character: CharacterDefinition | null;
  className: string;
  expression?: CharacterExpression;
}) {
  if (!character) {
    return <div className={`${className} character-empty`} aria-hidden="true" />;
  }

  return (
    <img
      className={`${className} character-figure ${character.toneClass ?? ""}`}
      src={getCharacterImageSrc(character, expression)}
      alt=""
      draggable={false}
    />
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatCollectionNumber(number: number) {
  return String(number).padStart(3, "0");
}

function formatAcquiredAt(acquiredAt: string) {
  const acquiredDate = new Date(acquiredAt);

  if (Number.isNaN(acquiredDate.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(acquiredDate);
}

function formatOptionalDuration(durationMs: number | undefined) {
  return typeof durationMs === "number" && Number.isFinite(durationMs)
    ? formatDuration(durationMs)
    : "-";
}

function formatOptionalPercent(ratio: number | undefined) {
  return typeof ratio === "number" && Number.isFinite(ratio)
    ? formatPercent(ratio)
    : "-";
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPercent(ratio: number) {
  if (!Number.isFinite(ratio)) {
    return "0%";
  }

  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

function MeasurePauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true">
      <rect x="6" y="5" width="5" height="14" rx="1" fill="currentColor" />
      <rect x="13" y="5" width="5" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

function MeasurePlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true">
      <path fill="#16a34a" d="M9 6.5v11l10-5.5-10-5.5z" />
    </svg>
  );
}

function MeasureStopIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="1.5"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * 5秒ウォームアップ用の暗幕＋円弧プログレス。
 * カメラ上に重ねて配置し、進捗は時計回り（右回り）に塗られる。
 */
type WarmupCountdownVeilProps = {
  remainingMs: number;
  totalMs: number;
};

function WarmupCountdownVeil({ remainingMs, totalMs }: WarmupCountdownVeilProps) {
  const safeTotal = Math.max(1, totalMs);
  const clampedRemaining = Math.max(0, Math.min(safeTotal, remainingMs));
  const progress = 1 - clampedRemaining / safeTotal;
  const seconds = Math.max(1, Math.ceil(clampedRemaining / 1000));

  // SVG 円周 (r=46) に対する dashoffset。0 → full circle (時計回り)。
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="warmup-veil" role="status" aria-live="polite">
      <div className="warmup-veil-inner">
        <svg
          className="warmup-veil-ring"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            className="warmup-veil-ring-track"
            cx="50"
            cy="50"
            r={radius}
            fill="none"
          />
          <circle
            className="warmup-veil-ring-progress"
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="warmup-veil-count" aria-hidden="true">
          {seconds}
        </div>
      </div>
      <p className="warmup-veil-label">基準姿勢を測定中…</p>
    </div>
  );
}
