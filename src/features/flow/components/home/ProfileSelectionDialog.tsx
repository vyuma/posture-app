import type { CSSProperties } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../../characters/types";
import { CharacterFigure } from "../shared/CharacterFigure";
import { SHOW_DEBUG_FLOW_CONTROLS } from "../shared/debugFlags";
import {
  getDebugQrModalStep2Preview,
  subscribeDebugQrModalStep2Preview,
  toggleDebugQrModalStep2Preview,
} from "../shared/debugQrModalFlowPrefs";

export type ProfileDialogDebugTools = {
  collectionResetTick: number;
  onShowOnboarding: () => void;
  onClearAcquiredCharacters: () => void;
  onPairingRefresh: () => void;
  onPairingSkipContinue: () => void;
  onPairingDisconnect: () => Promise<void>;
};

type ProfileSelectionDialogProps = {
  isClosing: boolean;
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  selectedProfileCharacterId: string | null;
  onSelect: (characterId: string) => void;
  onClose: () => void;
  debugTools?: ProfileDialogDebugTools;
};

export function ProfileSelectionDialog({
  isClosing,
  characters,
  acquiredCharacters,
  selectedProfileCharacterId,
  onSelect,
  onClose,
  debugTools,
}: ProfileSelectionDialogProps) {
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
            まだピンアナゴを獲得していません
          </p>
        )}
        {SHOW_DEBUG_FLOW_CONTROLS && debugTools ? (
          <ProfileDialogDebugPanel debugTools={debugTools} />
        ) : null}
      </div>
    </section>
  );
}

function ProfileDialogDebugPanel({
  debugTools,
}: {
  debugTools: ProfileDialogDebugTools;
}) {
  const [debugResetMessage, setDebugResetMessage] = useState<string | null>(
    null,
  );
  const [debugPairingMessage, setDebugPairingMessage] = useState<string | null>(
    null,
  );
  const [isDebugPairingDisconnecting, setIsDebugPairingDisconnecting] =
    useState(false);
  const [isDebugResetConfirming, setIsDebugResetConfirming] = useState(false);
  const debugQrStep2Preview = useSyncExternalStore(
    subscribeDebugQrModalStep2Preview,
    getDebugQrModalStep2Preview,
    getDebugQrModalStep2Preview,
  );

  useEffect(() => {
    setDebugResetMessage(null);
    setIsDebugResetConfirming(false);
  }, [debugTools.collectionResetTick]);

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
    if (!debugPairingMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebugPairingMessage(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [debugPairingMessage]);

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
    <div className="profile-dialog-debug" aria-label="DEBUG">
      <p className="profile-dialog-debug-label">DEBUG</p>
      <div className="profile-dialog-debug-buttons">
        <button
          type="button"
          className="home-single-debug-story profile-dialog-debug-btn"
          onClick={debugTools.onShowOnboarding}
        >
          DEBUG: ストーリー
        </button>
        <button
          type="button"
          className={`home-collection-debug-reset profile-dialog-debug-btn ${
            isDebugResetConfirming ? "is-confirming" : ""
          }`}
          onClick={() => {
            if (!isDebugResetConfirming) {
              setIsDebugResetConfirming(true);
              setDebugResetMessage("もう一度押すと削除");
              return;
            }

            debugTools.onClearAcquiredCharacters();
            setIsDebugResetConfirming(false);
            setDebugResetMessage("削除しました");
          }}
        >
          {isDebugResetConfirming
            ? "DEBUG: もう一度押す"
            : "DEBUG: 獲得データ削除"}
        </button>
        <button
          type="button"
          className="secondary-pill profile-dialog-debug-btn"
          onClick={() => {
            debugTools.onPairingRefresh();
          }}
        >
          DEBUG: QR更新
        </button>
        <button
          type="button"
          className="primary-pill profile-dialog-debug-btn"
          onClick={debugTools.onPairingSkipContinue}
        >
          DEBUG: QRスキップ
        </button>
        <button
          type="button"
          className="secondary-pill profile-dialog-debug-btn"
          disabled={isDebugPairingDisconnecting}
          onClick={async () => {
            setIsDebugPairingDisconnecting(true);
            setDebugPairingMessage(null);

            try {
              await debugTools.onPairingDisconnect();
              setDebugPairingMessage("スマホ接続を解除しました");
            } catch (error) {
              console.error("Failed to disconnect paired phone", error);
              setDebugPairingMessage("接続解除に失敗しました");
            } finally {
              setIsDebugPairingDisconnecting(false);
            }
          }}
        >
          {isDebugPairingDisconnecting
            ? "DEBUG: 解除中..."
            : "DEBUG: スマホ接続解除"}
        </button>
        <button
          type="button"
          className="home-single-debug-skip profile-dialog-debug-btn"
          onClick={() => toggleDebugQrModalStep2Preview()}
        >
          DEBUG: Step2 {debugQrStep2Preview ? "OFF" : "プレビュー"}
        </button>
      </div>
      {debugResetMessage ? (
        <span className="home-collection-debug-message" role="status">
          {debugResetMessage}
        </span>
      ) : null}
      {debugPairingMessage ? (
        <span className="home-collection-debug-message" role="status">
          {debugPairingMessage}
        </span>
      ) : null}
    </div>
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
