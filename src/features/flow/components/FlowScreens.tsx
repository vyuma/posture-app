import { useEffect, useState, type CSSProperties, type RefObject } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
  CharacterExpression,
} from "../../characters/types";
import { getCharacterImageSrc } from "../../characters/characterCatalog";
import { PostureViewer } from "../../posture";
import type { RuntimeSnapshot } from "../../posture/types";
import type { MeasurementResult, MeasurementStats } from "../types";

type HomeScreenProps = {
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  profileCharacter: CharacterDefinition | null;
  selectedProfileCharacterId: string | null;
  collectionResetTick: number;
  qrImageDataUrl: string;
  isPairingLoading: boolean;
  pairingError: string | null;
  isPaired: boolean;
  deviceName: string | null;
  qrCharacter: CharacterDefinition | null;
  onRefreshPairing: () => void;
  onContinueFromPaired: () => void;
  onProfileCharacterSelect: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
};

type CodeReadScreenProps = {
  nextCharacter: CharacterDefinition | null;
  isStartPending: boolean;
  onStartMeasurement: () => void;
  onBackHome: () => void;
};

type MeasuringScreenProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  status: string;
  snapshot: RuntimeSnapshot;
  stats: MeasurementStats;
  isBadPosture: boolean;
  isPaused: boolean;
  isOverlayEnabled: boolean;
  isCharacterOverlayEnabled: boolean;
  onFinishMeasurement: () => void;
  onPauseToggle: () => void;
  onOverlayEnabledChange: (enabled: boolean) => void;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
  onShowCharacterOverlay: () => void;
  onResetCharacterPosition: () => void;
  onOpenSoundSettings: () => void;
};

type PostureRegisteredScreenProps = {
  result: MeasurementResult;
  acquiredCharacter: CharacterDefinition | null;
  onBackHome: () => void;
  onMeasureAgain: () => void;
};

const COLLECTION_TOTAL_COUNT = 111;
const SHOW_DEBUG_COLLECTION_CONTROLS = import.meta.env.DEV;

export function HomeScreen(props: HomeScreenProps) {
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [collectionDetailCharacterId, setCollectionDetailCharacterId] = useState<
    string | null
  >(null);
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

  useEffect(() => {
    setCollectionDetailCharacterId(null);
  }, [props.collectionResetTick]);

  return (
    <main className="flow-screen home-single">
      <FlowBrand />
      <button
        type="button"
        className="home-single-profile"
        aria-label="プロフィールキャラクターを変更"
        onClick={() => setIsProfileDialogOpen(true)}
      >
        <CharacterFigure
          character={props.profileCharacter}
          className="home-single-profile-character"
        />
      </button>
      <section className="home-single-hero">
        <div className="home-single-copy">
          <h1>
            良い姿勢を継続して
            <br />
            ピンアナゴをゲットしよう
          </h1>
          <p>コードをスマホでスキャンしてください</p>
        </div>
        <QrPanel {...props} />
      </section>
      <CharacterCollection
        characters={props.characters}
        acquiredCharacters={props.acquiredCharacters}
        resetTick={props.collectionResetTick}
        onCharacterDetailOpen={setCollectionDetailCharacterId}
        onDebugClearAcquiredCharacters={props.onDebugClearAcquiredCharacters}
      />
      {isProfileDialogOpen ? (
        <ProfileSelectionDialog
          characters={props.characters}
          acquiredCharacters={props.acquiredCharacters}
          selectedProfileCharacterId={props.selectedProfileCharacterId}
          onSelect={(characterId) => {
            props.onProfileCharacterSelect(characterId);
            setIsProfileDialogOpen(false);
          }}
          onClose={() => setIsProfileDialogOpen(false)}
        />
      ) : null}
      {collectionDetailCharacter && collectionDetailAcquiredCharacter ? (
        <CollectionDetailDialog
          character={collectionDetailCharacter}
          acquiredCharacter={collectionDetailAcquiredCharacter}
          onClose={() => setCollectionDetailCharacterId(null)}
        />
      ) : null}
    </main>
  );
}

export function CodeReadScreen({
  nextCharacter,
  isStartPending,
  onStartMeasurement,
  onBackHome,
}: CodeReadScreenProps) {
  return (
    <main className="flow-screen flow-screen--focus code-read-screen">
      <FlowBrand />
      <button
        type="button"
        className="secondary-pill focus-home-button"
        onClick={onBackHome}
      >
        ホームに戻る
      </button>
      <section className="focus-copy" aria-labelledby="code-read-heading">
        <h1 id="code-read-heading">あなたの正しい姿勢を教えてください</h1>
        <p>PCの前で姿勢を正してください</p>
        <button
          type="button"
          className="primary-pill"
          onClick={onStartMeasurement}
          disabled={isStartPending}
        >
          {isStartPending ? "登録中..." : "この姿勢を登録する"}
        </button>
      </section>
      <section className="focus-character" aria-label="次に出会えるキャラクター">
        <p className="focus-character-callout">ピン</p>
        <CharacterFigure
          character={nextCharacter}
          className="focus-character-image"
        />
      </section>
    </main>
  );
}

export function MeasuringScreen({
  videoRef,
  canvasRef,
  ready,
  status,
  snapshot,
  stats,
  isBadPosture,
  isPaused,
  isOverlayEnabled,
  isCharacterOverlayEnabled,
  onFinishMeasurement,
  onPauseToggle,
  onOverlayEnabledChange,
  onCharacterOverlayEnabledChange,
  onShowCharacterOverlay,
  onResetCharacterPosition,
  onOpenSoundSettings,
}: MeasuringScreenProps) {
  const isWarmup = !snapshot.baselineReady;
  const warmupSeconds = Math.max(
    0,
    Math.ceil(snapshot.warmupRemainingMs / 1000),
  );

  return (
    <main className="flow-screen measuring-screen">
      <FlowBrand />
      <section className="measure-header" aria-labelledby="measuring-heading">
        <div>
          <h1 id="measuring-heading">
            {isWarmup ? "基準姿勢を測定中" : "姿勢を測定中"}
          </h1>
          <p>
            {isWarmup
              ? "肩の力を抜いて、正面を向いたまま少し待ってください。"
              : "ピンアナゴを逃がさないように、良い姿勢をキープしよう。"}
          </p>
        </div>
        <div className="measure-actions">
          <button type="button" className="secondary-pill" onClick={onPauseToggle}>
            {isPaused ? "再開" : "一時停止"}
          </button>
          <button
            type="button"
            className="primary-pill"
            onClick={onFinishMeasurement}
            disabled={!snapshot.baselineReady || stats.activeMeasurementMs <= 0}
          >
            測定終了
          </button>
        </div>
      </section>

      <section className="measure-layout">
        <div className="measure-camera-panel">
          <PostureViewer
            videoRef={videoRef}
            canvasRef={canvasRef}
            isBadPosture={isBadPosture}
            isOverlayEnabled={isOverlayEnabled}
            isCharacterOverlayEnabled={isCharacterOverlayEnabled}
            experiment={snapshot.experiment}
            onOverlayEnabledChange={onOverlayEnabledChange}
            onCharacterOverlayEnabledChange={onCharacterOverlayEnabledChange}
          />
        </div>

        <aside className="measure-status-panel" aria-label="測定状況">
          <div className={`status ${ready ? "ok" : "warn"}`}>{status}</div>
          <MetricTile
            label={isWarmup ? "測定開始まで" : "測定時間"}
            value={isWarmup ? `${warmupSeconds}s` : formatDuration(stats.activeMeasurementMs)}
          />
          <MetricTile label="良い姿勢" value={formatPercent(stats.goodRatio)} />
          <MetricTile
            label="現在の状態"
            value={formatPostureState(snapshot.postureState, isWarmup, isPaused)}
          />
          <div className="measure-progress" aria-hidden="true">
            <span style={{ width: `${Math.round(stats.goodRatio * 100)}%` }} />
          </div>
          <div className="measure-tool-row">
            {!isCharacterOverlayEnabled ? (
              <button type="button" className="tool-pill" onClick={onShowCharacterOverlay}>
                キャラ表示
              </button>
            ) : null}
            <button type="button" className="tool-pill" onClick={onResetCharacterPosition}>
              位置リセット
            </button>
            <button type="button" className="tool-pill" onClick={onOpenSoundSettings}>
              サウンド
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

export function PostureRegisteredScreen({
  result,
  acquiredCharacter,
  onBackHome,
  onMeasureAgain,
}: PostureRegisteredScreenProps) {
  const wasSuccessful = result.rewardQualified;

  return (
    <main className="flow-screen flow-screen--focus result-screen">
      <FlowBrand />
      <section className="focus-copy" aria-labelledby="registered-heading">
        <h1 id="registered-heading">
          {wasSuccessful
            ? "ピンアナゴを逃がさないように良い姿勢をキープしました"
            : "もう少しでピンアナゴに出会えそうです"}
        </h1>
        <p>
          測定時間 {formatDuration(result.activeMeasurementMs)} / 良い姿勢{" "}
          {formatPercent(result.goodRatio)}
        </p>
        <div className="result-metrics">
          <MetricTile label="良い姿勢時間" value={formatDuration(result.goodMs)} />
          <MetricTile
            label="キャラクター"
            value={acquiredCharacter ? "習得" : "未習得"}
          />
        </div>
        <div className="result-actions">
          <button type="button" className="primary-pill" onClick={onBackHome}>
            ホームへ
          </button>
          <button type="button" className="secondary-pill" onClick={onMeasureAgain}>
            もう一度測定
          </button>
        </div>
      </section>

      <section className="focus-character result-character" aria-label="測定結果">
        <p>{acquiredCharacter ? acquiredCharacter.name : "次回チャレンジ"}</p>
        <CharacterFigure
          character={acquiredCharacter}
          className="focus-character-image"
          expression="happy"
        />
        {acquiredCharacter ? (
          <small>{acquiredCharacter.story}</small>
        ) : (
          <small>良い姿勢が50%以上になるとキャラクターを習得できます。</small>
        )}
      </section>
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

function QrPanel({
  qrImageDataUrl,
  isPairingLoading,
  pairingError,
  isPaired,
  deviceName,
  onRefreshPairing,
  onContinueFromPaired,
}: HomeScreenProps) {
  return (
    <div className="home-single-qr">
      <div className="home-single-qr-stage">
        {qrImageDataUrl ? (
          <div className="home-single-qr-frame">
            <img
              className="home-single-qr-anago"
              src="/logo/QRアナゴ.png"
              alt=""
              draggable={false}
              aria-hidden="true"
            />
            <div className="home-single-qr-core">
              <img
                className="home-single-qr-image"
                src={qrImageDataUrl}
                alt="ペアリングQRコード"
              />
            </div>
          </div>
        ) : (
          <div className="home-single-qr-placeholder">
            {isPairingLoading ? "QR準備中..." : "QRを表示できません"}
          </div>
        )}
      </div>
      <div className="home-single-qr-status">
        <strong>{isPaired ? "読み取り済み" : "読み取り待機中"}</strong>
        <span>{deviceName ?? "スマホでQRを読み取ってください"}</span>
        {pairingError ? <small>{pairingError}</small> : null}
      </div>
      <div className="home-single-qr-actions">
        <button
          type="button"
          className="secondary-pill home-single-secondary-pill"
          onClick={onRefreshPairing}
        >
          更新
        </button>
        {isPaired ? (
          <button
            type="button"
            className="primary-pill home-single-primary-pill"
            onClick={onContinueFromPaired}
          >
            次へ
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CharacterCollection({
  characters,
  acquiredCharacters,
  resetTick,
  onCharacterDetailOpen,
  onDebugClearAcquiredCharacters,
}: {
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  resetTick: number;
  onCharacterDetailOpen: (characterId: string) => void;
  onDebugClearAcquiredCharacters: () => void;
}) {
  const [debugResetMessage, setDebugResetMessage] = useState<string | null>(
    null,
  );
  const [isDebugResetConfirming, setIsDebugResetConfirming] = useState(false);
  const acquiredCharactersById = new Map(
    acquiredCharacters.map((character) => [character.characterId, character]),
  );
  const acquiredSlots = characters
    .map((character, index) => ({
      character,
      acquiredCharacter: acquiredCharactersById.get(character.id) ?? null,
      number: index + 1,
    }))
    .filter((slot) => slot.acquiredCharacter !== null);
  const acquiredCount = Math.min(acquiredSlots.length, COLLECTION_TOTAL_COUNT);
  const nextLockedNumber =
    acquiredCount < COLLECTION_TOTAL_COUNT ? acquiredCount + 1 : null;

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
        {acquiredSlots.map(({ character }) => {
          const cardStyle = {
            "--home-character-color": character.characterColor.primary,
            "--home-character-soft-color": character.characterColor.soft,
          } as CSSProperties;

          return (
            <button
              type="button"
              key={character.id}
              className="home-character-card is-acquired"
              style={cardStyle}
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
              <span className="home-favorite-heart" aria-hidden="true">
                ♥
              </span>
            </button>
          );
        })}
        {nextLockedNumber !== null ? (
          <article
            className="home-character-card is-locked"
            aria-label={`未習得キャラクター ${formatCollectionNumber(nextLockedNumber)}`}
          >
            <span className="home-locked-slot">
              {formatCollectionNumber(nextLockedNumber)}
            </span>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function CollectionDetailDialog({
  character,
  acquiredCharacter,
  onClose,
}: {
  character: CharacterDefinition;
  acquiredCharacter: AcquiredCharacter;
  onClose: () => void;
}) {
  const dialogStyle = {
    "--home-character-color": character.characterColor.primary,
    "--home-character-soft-color": character.characterColor.soft,
  } as CSSProperties;

  return (
    <section
      className="collection-detail-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="collection-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-detail-heading"
        style={dialogStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="collection-detail-header">
          <h2 id="collection-detail-heading">{character.name}</h2>
          <button
            type="button"
            className="collection-detail-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="collection-detail-body">
          <div className="collection-detail-preview">
            <CharacterFigure
              character={character}
              className="collection-detail-character"
            />
          </div>
          <div className="collection-detail-info">
            <div className="collection-detail-stat">
              <span>習得日</span>
              <strong>{formatAcquiredAt(acquiredCharacter.acquiredAt)}</strong>
            </div>
            <div className="collection-detail-stat">
              <span>良い姿勢時間</span>
              <strong>{formatOptionalDuration(acquiredCharacter.goodMs)}</strong>
            </div>
            <div className="collection-detail-stat">
              <span>稼働時間</span>
              <strong>
                {formatOptionalDuration(acquiredCharacter.activeMeasurementMs)}
              </strong>
            </div>
            <div className="collection-detail-stat">
              <span>良い姿勢率</span>
              <strong>{formatOptionalPercent(acquiredCharacter.goodRatio)}</strong>
            </div>
          </div>
        </div>
        <div className="collection-detail-section">
          <h3>性格</h3>
          <div className="collection-detail-tags">
            {character.personalityTags.map((tag) => (
              <span className="home-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <p className="collection-detail-story">{character.story}</p>
      </div>
    </section>
  );
}

function ProfileSelectionDialog({
  characters,
  acquiredCharacters,
  selectedProfileCharacterId,
  onSelect,
  onClose,
}: {
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
    <section className="profile-dialog-backdrop" role="presentation" onMouseDown={onClose}>
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

function formatPostureState(
  postureState: RuntimeSnapshot["postureState"],
  isWarmup: boolean,
  isPaused: boolean,
) {
  if (isPaused) {
    return "一時停止";
  }

  if (isWarmup) {
    return "準備中";
  }

  switch (postureState) {
    case "good":
      return "良い姿勢";
    case "bad":
      return "要調整";
    case "hold":
      return "判定中";
  }
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
