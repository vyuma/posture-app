import { useEffect, useRef, useState, type CSSProperties } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../../characters/types";
import { COLLECTION_TOTAL_COUNT } from "../shared/debugFlags";
import { CharacterFigure } from "../shared/CharacterFigure";
import { formatCollectionNumber } from "../shared/formatters";
import {
  onCardSlotMouseLeave,
  onCardSlotMouseMove,
} from "../shared/cardTilt";

type CharacterCollectionProps = {
  characters: CharacterDefinition[];
  acquiredCharacters: AcquiredCharacter[];
  favoriteCharacterIds: Set<string>;
  onCharacterDetailOpen: (characterId: string) => void;
  onToggleFavoriteCharacter: (characterId: string) => void;
};

export function CharacterCollection({
  characters,
  acquiredCharacters,
  favoriteCharacterIds,
  onCharacterDetailOpen,
  onToggleFavoriteCharacter,
}: CharacterCollectionProps) {
  const [heartSparkleCharacterId, setHeartSparkleCharacterId] = useState<
    string | null
  >(null);
  const heartSparkleFrameRef = useRef<number | null>(null);
  const heartSparkleTimerRef = useRef<number | null>(null);
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
    return () => {
      if (heartSparkleFrameRef.current !== null) {
        window.cancelAnimationFrame(heartSparkleFrameRef.current);
      }
      if (heartSparkleTimerRef.current !== null) {
        window.clearTimeout(heartSparkleTimerRef.current);
      }
    };
  }, []);

  function triggerHeartSparkle(characterId: string) {
    if (heartSparkleFrameRef.current !== null) {
      window.cancelAnimationFrame(heartSparkleFrameRef.current);
    }
    if (heartSparkleTimerRef.current !== null) {
      window.clearTimeout(heartSparkleTimerRef.current);
    }

    setHeartSparkleCharacterId(null);
    heartSparkleFrameRef.current = window.requestAnimationFrame(() => {
      heartSparkleFrameRef.current = null;
      setHeartSparkleCharacterId(characterId);
      heartSparkleTimerRef.current = window.setTimeout(() => {
        setHeartSparkleCharacterId(null);
        heartSparkleTimerRef.current = null;
      }, 520);
    });
  }

  return (
    <section className="home-collection" aria-labelledby="collection-heading">
      <div className="home-collection-heading">
        <h2 id="collection-heading">コレクション</h2>
        <strong className="home-collection-count">
          {acquiredCount}
          <span> / {COLLECTION_TOTAL_COUNT}</span>
        </strong>
      </div>
      <div className="home-collection-grid">
        {collectionSlots.map(({ character, acquiredCharacter, number }, index) => {
          const animDelayMs = Math.min(index * 28, 280);

          if (character === null || acquiredCharacter === null) {
            return (
              <div
                className="home-character-slot is-locked-slot"
                key={`locked-${number}`}
                style={{ "--card-anim-delay": `${animDelayMs}ms` } as CSSProperties}
              >
                <article
                  className="home-character-card is-locked"
                  aria-label={`未獲得キャラクター ${formatCollectionNumber(number)}`}
                >
                  <span className="home-locked-slot">
                    {formatCollectionNumber(number)}
                  </span>
                </article>
              </div>
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
              className={`home-character-slot ${
                heartSparkleCharacterId === character.id
                  ? "is-heart-sparkling"
                  : ""
              }`}
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
                  if (!isFavorite) {
                    triggerHeartSparkle(character.id);
                  }
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
