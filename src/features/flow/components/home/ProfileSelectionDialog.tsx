import type { CSSProperties } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../../characters/types";
import { CharacterFigure } from "../shared/CharacterFigure";

type ProfileSelectionDialogProps = {
  isClosing: boolean;
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  selectedProfileCharacterId: string | null;
  onSelect: (characterId: string) => void;
  onClose: () => void;
};

export function ProfileSelectionDialog({
  isClosing,
  characters,
  acquiredCharacters,
  selectedProfileCharacterId,
  onSelect,
  onClose,
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
