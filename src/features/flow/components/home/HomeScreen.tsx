import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CharacterDefinition } from "../../../characters/types";
import type { HomeScreenProps } from "../flowScreenTypes";
import { CharacterFigure } from "../shared/CharacterFigure";
import {
  DIALOG_CLOSE_DURATION_MS,
  SHOW_DEBUG_FLOW_CONTROLS,
} from "../shared/debugFlags";
import { FlowBrand } from "../shared/FlowBrand";
import { CharacterCollection } from "./CharacterCollection";
import { CollectionDetailDialog } from "./CollectionDetailDialog";
import { ProfileSelectionDialog } from "./ProfileSelectionDialog";

let lastHomeHeroCharacterId: string | null = null;

export function HomeScreen(props: HomeScreenProps) {
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isProfileDialogClosing, setIsProfileDialogClosing] = useState(false);
  const [collectionDetailCharacterId, setCollectionDetailCharacterId] = useState<
    string | null
  >(null);
  const [isCollectionDetailClosing, setIsCollectionDetailClosing] = useState(false);
  const favoriteHeroCharacters = useMemo(
    () => getFavoriteHeroCharacters(props.characters, props.favoriteCharacterIds),
    [props.characters, props.favoriteCharacterIds],
  );
  const [heroFavoriteCharacterId, setHeroFavoriteCharacterId] = useState<
    string | null
  >(() =>
    rerollFavoriteHeroCharacterId(
      favoriteHeroCharacters,
      lastHomeHeroCharacterId,
    ),
  );
  const didMountHeroPickerRef = useRef(false);

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
  const favoriteHeroCharacter =
    heroFavoriteCharacterId !== null
      ? favoriteHeroCharacters.find(
          (character) => character.id === heroFavoriteCharacterId,
        ) ?? null
      : null;
  const homeHeroCharacter = favoriteHeroCharacter ?? props.profileCharacter;

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

  useEffect(() => {
    if (!didMountHeroPickerRef.current) {
      didMountHeroPickerRef.current = true;
      return;
    }

    setHeroFavoriteCharacterId((current) => {
      if (
        current !== null &&
        favoriteHeroCharacters.some((character) => character.id === current)
      ) {
        return current;
      }

      return pickRandomCharacterId(favoriteHeroCharacters, null);
    });
  }, [favoriteHeroCharacters]);

  return (
    <main className="flow-screen home-single">
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
              ピンアナゴを獲得しよう
            </h1>
          </div>
          <div className="home-hero-actions">
            <button
              type="button"
              className="home-hero-action-btn"
              onClick={props.onOpenMobileConnect}
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
          key={homeHeroCharacter?.id ?? "empty-hero-character"}
          character={homeHeroCharacter}
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

function getFavoriteHeroCharacters(
  characters: CharacterDefinition[],
  favoriteCharacterIds: Set<string>,
) {
  return characters.filter((character) => favoriteCharacterIds.has(character.id));
}

function rerollFavoriteHeroCharacterId(
  characters: CharacterDefinition[],
  excludedCharacterId: string | null,
) {
  const nextCharacterId = pickRandomCharacterId(characters, excludedCharacterId);
  lastHomeHeroCharacterId = nextCharacterId;
  return nextCharacterId;
}

function pickRandomCharacterId(
  characters: CharacterDefinition[],
  excludedCharacterId: string | null,
) {
  if (characters.length === 0) {
    return null;
  }

  if (characters.length === 1) {
    return characters[0].id;
  }

  const candidates = excludedCharacterId
    ? characters.filter((character) => character.id !== excludedCharacterId)
    : characters;
  const pickPool = candidates.length > 0 ? candidates : characters;
  const index = Math.floor(Math.random() * pickPool.length);
  return pickPool[index]?.id ?? null;
}
