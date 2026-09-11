import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  CHARACTER_CATALOG,
  getCharacterImageSrc,
} from "../../characters/characterCatalog";
import type { CharacterDefinition } from "../../characters/types";
import { loadSoundSettings } from "../../sound/services/soundSettingsStorage";

type StorySlide = {
  id: string;
  eyebrow: string;
  title?: string;
  body: string[];
  variant: "splash" | "friends" | "message" | "warning" | "return" | "reward" | "final";
};

type OnboardingStoryScreenProps = {
  onComplete: () => void;
};

type SecondPageCharacterLayout = {
  characterId: CharacterDefinition["id"];
  left: string;
  bottom: string;
  width: string;
  scale?: number;
  zIndex?: number;
  rotate?: string;
  delayMs?: number;
};

type AdjustableArtworkLayout = {
  left: string;
  bottom: string;
  width: string;
  scale?: number;
  rotate?: string;
  zIndex?: number;
};

type DockCharacterLayout = AdjustableArtworkLayout & {
  hideBottom: string;
};

type DockCharacterTuning = {
  xPercent: number;
  dockDepthPercent: number;
  sizePercent: number;
  scale?: number;
  rotateDeg?: number;
  zIndex?: number;
  hideBottomPercent: number;
};

type ReturnPageLayoutTuning = {
  characterXPercent: number;
  characterBottomPercent: number;
  characterWidthPercent: number;
  characterScale: number;
  characterRotateDeg: number;
  characterHideBottomPercent: number;
  characterRiseStartPercent: number;
  soundGapPx: number;
  soundWidthPercentOfCharacter: number;
  soundDelayMs: number;
  soundDurationMs: number;
};

type RewardPageLayoutTuning = {
  cardXPercent: number;
  cardTopPercent: number;
  cardWidthMinPx: number;
  cardWidthVw: number;
  cardWidthDvh: number;
  cardWidthMaxPx: number;
  cardScale: number;
  cardRotateDeg: number;
  characterOffsetXPercent: number;
  characterOffsetYPercent: number;
  characterScale: number;
  characterRotateDeg: number;
};

type FinalPageLayoutTuning = {
  rowTopPercent: number;
  rowWidthVw: number;
  rowMaxPx: number;
  cardGapPx: number;
  cardScale: number;
  characterOffsetXPercent: number;
  characterOffsetYPercent: number;
  characterScale: number;
  hoverLiftPx: number;
  hoverScale: number;
};

function percent(value: number) {
  return `${value}%`;
}

function negativePercent(value: number) {
  return `-${value}%`;
}

function px(value: number) {
  return `${value}px`;
}

function ms(value: number) {
  return `${value}ms`;
}

function responsivePxWidth({
  minPx,
  vw,
  dvh,
  maxPx,
}: {
  minPx: number;
  vw: number;
  dvh: number;
  maxPx: number;
}) {
  return `clamp(${minPx}px, min(${vw}vw, ${dvh}dvh), ${maxPx}px)`;
}

function createDockCharacterLayout(tuning: DockCharacterTuning): DockCharacterLayout {
  return {
    left: percent(tuning.xPercent),
    bottom: negativePercent(tuning.dockDepthPercent),
    width: percent(tuning.sizePercent),
    scale: tuning.scale,
    rotate: `${tuning.rotateDeg ?? 0}deg`,
    zIndex: tuning.zIndex,
    hideBottom: percent(tuning.hideBottomPercent),
  };
}

const SECOND_PAGE_CHARACTER_LAYOUTS: SecondPageCharacterLayout[] = [
  {
    characterId: "shin-anago",
    left: "9.86%",
    bottom: "0",
    width: "min(8.23vw, 12.68dvh)",
    scale: 2,
    zIndex: 4,
    rotate: "0deg",
    delayMs: 0,
  },
  {
    characterId: "oto-anago",
    left: "23.24%",
    bottom: "0",
    width: "min(8.23vw, 12.68dvh)",
    scale: 2,
    zIndex: 5,
    rotate: "0deg",
    delayMs: 100,
  },
  {
    characterId: "kuro-anyago",
    left: "36.62%",
    bottom: "0",
    width: "min(8.23vw, 12.68dvh)",
    scale: 2,
    zIndex: 6,
    rotate: "0deg",
    delayMs: 180,
  },
  {
    characterId: "normal-nago",
    left: "50%",
    bottom: "0",
    width: "min(8.23vw, 12.68dvh)",
    scale: 2,
    zIndex: 7,
    rotate: "0deg",
    delayMs: 260,
  },
  {
    characterId: "dot-nago",
    left: "63.38%",
    bottom: "0",
    width: "min(8.23vw, 12.68dvh)",
    scale: 2,
    zIndex: 6,
    rotate: "0deg",
    delayMs: 340,
  },
  {
    characterId: "moja-anago",
    left: "76.76%",
    bottom: "0",
    width: "min(8.23vw, 12.68dvh)",
    scale: 2,
    zIndex: 5,
    rotate: "0deg",
    delayMs: 420,
  },
  {
    characterId: "hat-anago",
    left: "90.14%",
    bottom: "0",
    width: "min(8.23vw, 12.68dvh)",
    scale: 2,
    zIndex: 4,
    rotate: "0deg",
    delayMs: 500,
  },
];

const THIRD_PAGE_ANAGO_TUNING: DockCharacterTuning = {
  xPercent: 68.3,
  dockDepthPercent: 500,
  sizePercent: 7.8,
  scale: 1,
  rotateDeg: 0,
  zIndex: 2,
  hideBottomPercent: 61,
};

const THIRD_PAGE_ANAGO_LAYOUT = createDockCharacterLayout(THIRD_PAGE_ANAGO_TUNING);

// 5 / 7 return page quick tuning:
// adjust only these numbers for character/sound text position and size.
const RETURN_PAGE_LAYOUT_TUNING: ReturnPageLayoutTuning = {
  characterXPercent: 50,
  characterBottomPercent: 61,
  characterWidthPercent: 21.8,
  characterScale: 2.02,
  characterRotateDeg: 0,
  characterHideBottomPercent: 10,
  characterRiseStartPercent: 138,
  soundGapPx: 9,
  soundWidthPercentOfCharacter: 118,
  soundDelayMs: 120,
  soundDurationMs: 920,
};
const RETURN_STORY_SOUND_SRC = "/sounds/2.mp3";

// 5 / 6 reward（アイブロー "5 / 6"）：カードとキャラはこの定数だけ触る
const REWARD_PAGE_LAYOUT_TUNING: RewardPageLayoutTuning = {
  cardXPercent: 50,
  cardTopPercent: 22,
  cardWidthMinPx: 220,
  cardWidthVw: 16.85,
  cardWidthDvh: 35.9,
  cardWidthMaxPx: 355,
  cardScale: 1,
  cardRotateDeg: 0,
  characterOffsetXPercent: -50,
  characterOffsetYPercent: -2,
  characterScale: 1.5,
  characterRotateDeg: 0,
};

// 6 / 6 final page quick tuning:
// edit only these numbers to move/resize the collection card row.
const FINAL_PAGE_LAYOUT_TUNING: FinalPageLayoutTuning = {
  rowTopPercent: 58.66,
  rowWidthVw: 90.08,
  rowMaxPx: 1362,
  cardGapPx: 24,
  cardScale: 1,
  characterOffsetXPercent: 50,
  characterOffsetYPercent: -90,
  characterScale: 1,
  hoverLiftPx: 12,
  hoverScale: 1.02,
};

const FINAL_PAGE_CHARACTER_IDS: CharacterDefinition["id"][] = [
  "shin-anago",
  "oto-anago",
  "kuro-anyago",
  "dot-nago",
  "moja-anago",
  "hat-anago",
];

const STORY_SLIDES: StorySlide[] = [
  {
    id: "splash",
    eyebrow: "1 / 7",
    title: "Piin",
    body: [],
    variant: "splash",
  },
  {
    id: "intro",
    eyebrow: "1 / 6",
    body: [
      "彼らの名前は、ピンアナゴ。",
      "あなたのモニターに生息しています。",
    ],
    variant: "friends",
  },
  {
    id: "friends",
    eyebrow: "2 / 6",
    body: [
      "ピンアナゴは姿勢のよい人間が大好き。",
      "良い姿勢を求めて毎日新しい仲間がやってきます。",
    ],
    variant: "message",
  },
  {
    id: "warning",
    eyebrow: "3 / 6",
    body: [
      "悪い姿勢が続くと逃げてしまいます。",
      "姿勢が崩れた時は、バイブでお知らせします。",
    ],
    variant: "warning",
  },
  {
    id: "return",
    eyebrow: "4 / 6",
    body: ["あなたが背筋を伸ばすと", "ピーンと音を立てて喜びます。"],
    variant: "return",
  },
  {
    id: "reward",
    eyebrow: "5 / 6",
    body: ["良い姿勢率が50%を達成すると", "新しいピンアナゴを獲得できるよ！"],
    variant: "reward",
  },
  {
    id: "final",
    eyebrow: "6 / 6",
    body: [
      "ピンアナゴは全部で111種類",
      "全種類あつめて良い姿勢を習慣化しよう！",
    ],
    variant: "final",
  },
];

export function OnboardingStoryScreen({ onComplete }: OnboardingStoryScreenProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [animDir, setAnimDir] = useState<"forward" | "backward">("forward");
  /* animKey：スライドが変わるたびに増加してアニメーションを再トリガー */
  const [animKey, setAnimKey] = useState(0);

  const currentSlide = STORY_SLIDES[slideIndex];
  const isSplashSlide = currentSlide.variant === "splash";
  const isStoryIntroSlide = slideIndex === 1;
  const isDockStorySlide = currentSlide.variant === "message";
  const isWarningStorySlide = currentSlide.variant === "warning";
  const isReturnStorySlide = currentSlide.variant === "return";
  const isRewardStorySlide = currentSlide.variant === "reward";
  const isFinalStorySlide = currentSlide.variant === "final";
  const isSceneStorySlide =
    isDockStorySlide ||
    isWarningStorySlide ||
    isReturnStorySlide ||
    isRewardStorySlide ||
    isFinalStorySlide;
  const isFinalSlide = slideIndex === STORY_SLIDES.length - 1;
  const featuredCharacters = useMemo(
    () =>
      [
        CHARACTER_CATALOG[1],
        CHARACTER_CATALOG[5],
        CHARACTER_CATALOG[2],
        CHARACTER_CATALOG[0],
        CHARACTER_CATALOG[3],
        CHARACTER_CATALOG[4],
        CHARACTER_CATALOG[6],
      ].filter((character): character is CharacterDefinition => character !== undefined),
    [],
  );

  const goNext = useCallback(() => {
    if (isFinalSlide) {
      onComplete();
      return;
    }
    setAnimDir("forward");
    setAnimKey((k) => k + 1);
    setSlideIndex((current) => Math.min(current + 1, STORY_SLIDES.length - 1));
  }, [isFinalSlide, onComplete]);

  const goPrevious = useCallback(() => {
    setAnimDir("backward");
    setAnimKey((k) => k + 1);
    setSlideIndex((current) => Math.max(current - 1, 0));
  }, []);

  const goToSlide = (nextIndex: number) => {
    if (nextIndex === slideIndex) {
      return;
    }

    setAnimDir(nextIndex > slideIndex ? "forward" : "backward");
    setAnimKey((k) => k + 1);
    setSlideIndex(nextIndex);
  };

  /* キーボードショートカット：矢印キーで操作可能 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      else if (e.key === "ArrowLeft") goPrevious();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrevious]);

  useEffect(() => {
    if (!isReturnStorySlide) {
      return;
    }

    const settings = loadSoundSettings();
    if (!settings.enabled) {
      return;
    }

    const audio = new Audio(RETURN_STORY_SOUND_SRC);
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(1, settings.volume));
    void audio.play().catch(() => {
      // ignore playback failures (autoplay policy, interruption)
    });

    return () => {
      audio.pause();
    };
  }, [isReturnStorySlide, animKey]);

  return (
    <main
      className={`onboarding-screen ${isSplashSlide ? "is-splash-active" : ""} ${
        isStoryIntroSlide ? "is-story-intro" : ""
      } ${isDockStorySlide ? "is-dock-story" : ""} ${
        isWarningStorySlide ? "is-warning-story" : ""
      } ${isReturnStorySlide ? "is-return-story" : ""} ${
        isRewardStorySlide ? "is-reward-story" : ""
      } ${isFinalStorySlide ? "is-final-story" : ""} ${
        isSceneStorySlide ? "is-scene-story" : ""
      }`}
      aria-labelledby="onboarding-heading"
    >
      <div className="onboarding-bubbles" aria-hidden="true">
        {Array.from({ length: 11 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      {!isSplashSlide ? (
        <header className="onboarding-header">
          <img
            className="onboarding-logo"
            src="/logo/logo_white.png"
            alt="Piin"
            draggable={false}
          />
          {!isStoryIntroSlide && !isSceneStorySlide ? (
            <button type="button" className="onboarding-skip" onClick={onComplete}>
              スキップ
            </button>
          ) : null}
        </header>
      ) : null}

      <section
        className={`onboarding-stage onboarding-stage--${currentSlide.variant}`}
      >
        {/* スライドコンテンツ：keyで方向付きアニメーションを毎回トリガー */}
        <div
          key={`content-${animKey}`}
          className={`onboarding-slide-content onboarding-slide-content--${animDir}`}
        >
          {!isSplashSlide ? (
            <p className="onboarding-step">{currentSlide.eyebrow}</p>
          ) : null}
          <div className="onboarding-message">
            {currentSlide.variant === "splash" ? (
              <>
                <h1 id="onboarding-heading" className="onboarding-sr-title">
                  Piiin
                </h1>
                <img
                  className="onboarding-main-logo"
                  src="/logo/logo_main.png"
                  alt=""
                  draggable={false}
                />
              </>
            ) : currentSlide.title ? (
              <h1 id="onboarding-heading">{currentSlide.title}</h1>
            ) : (
              <h1 id="onboarding-heading" className="onboarding-sr-title">
                Piiin Story
              </h1>
            )}
            {currentSlide.body.map((line, index) => (
              <p
                key={line}
                style={{ "--line-delay": `${0.14 + index * 0.11}s` } as CSSProperties}
              >
                {line}
              </p>
            ))}
          </div>
          {isSplashSlide ? (
            <button
              type="button"
              className="onboarding-splash-next"
              onClick={goNext}
            >
              はじめる
            </button>
          ) : null}
        </div>
        <div
          key={`art-${animKey}`}
          className={`onboarding-artwork-wrapper onboarding-artwork-wrapper--${animDir}`}
        >
          {!isSplashSlide ? (
            <StoryArtwork slide={currentSlide} characters={featuredCharacters} />
          ) : null}
        </div>
      </section>

      <button
        type="button"
        className="onboarding-side-button onboarding-side-button--prev"
        onClick={goPrevious}
        disabled={slideIndex === 0}
        aria-label="前のストーリーへ"
      >
        <span className="onboarding-side-chevron" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="onboarding-side-button onboarding-side-button--next"
        onClick={goNext}
        aria-label={isFinalSlide ? "ストーリーを終了" : "次のストーリーへ"}
      >
        <span className="onboarding-side-chevron" aria-hidden="true" />
      </button>

      <footer className="onboarding-footer">
        <div className="onboarding-dots" aria-label="ストーリー進行状況">
          {STORY_SLIDES.slice(1).map((slide, index) => {
            const targetIndex = index + 1;

            return (
              <button
                type="button"
                key={slide.id}
                className={targetIndex === slideIndex ? "is-active" : ""}
                aria-label={`${index + 1}枚目を表示`}
                aria-current={targetIndex === slideIndex ? "step" : undefined}
                onClick={() => goToSlide(targetIndex)}
              />
            );
          })}
        </div>
      </footer>
    </main>
  );
}

function StoryArtwork({
  slide,
  characters,
}: {
  slide: StorySlide;
  characters: CharacterDefinition[];
}) {
  switch (slide.variant) {
    case "friends":
      return <CharacterLineup characters={characters} />;
    case "warning":
      return <WarningArtwork character={characters[3] ?? null} />;
    case "return":
      return <ReturnArtwork character={characters[0] ?? null} />;
    case "reward": {
      const rewardCharacter =
        characters.find((character) => character.id === "normal-nago") ??
        CHARACTER_CATALOG[0] ??
        null;
      return <RewardArtwork character={rewardCharacter} />;
    }
    case "final":
      return <FinalArtwork characters={characters} />;
    case "message":
      return <DockStoryArtwork character={characters[3] ?? null} />;
    case "splash":
      return <SplashArtwork character={characters[3] ?? null} />;
  }
}

function CharacterLineup({ characters }: { characters: CharacterDefinition[] }) {
  const charactersById = new Map(
    characters.map((character) => [character.id, character]),
  );

  return (
    <div className="onboarding-character-lineup" aria-hidden="true">
      {SECOND_PAGE_CHARACTER_LAYOUTS.map((layout, index) => {
        const character = charactersById.get(layout.characterId);

        if (!character) {
          return null;
        }

        const style = {
          left: layout.left,
          bottom: layout.bottom,
          width: layout.width,
          zIndex: layout.zIndex ?? index + 3,
          "--character-delay": `${layout.delayMs ?? index * 80}ms`,
          "--character-color": character.characterColor.primary,
          "--character-rotate": layout.rotate ?? "0deg",
          "--character-scale": layout.scale ?? 1,
        } as CSSProperties;

        return (
          <img
            key={character.id}
            className="onboarding-lineup-character"
            src={getCharacterImageSrc(character)}
            alt=""
            draggable={false}
            style={style}
          />
        );
      })}
    </div>
  );
}

function SplashArtwork({ character }: { character: CharacterDefinition | null }) {
  if (!character) {
    return null;
  }

  return (
    <img
      className="onboarding-splash-character"
      src={getCharacterImageSrc(character)}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  );
}

function DockStoryArtwork({
  character,
}: {
  character: CharacterDefinition | null;
}) {
  const characterStyle = {
    "--dock-character-left": THIRD_PAGE_ANAGO_LAYOUT.left,
    "--dock-character-bottom": THIRD_PAGE_ANAGO_LAYOUT.bottom,
    "--dock-character-width": THIRD_PAGE_ANAGO_LAYOUT.width,
    "--dock-character-scale": THIRD_PAGE_ANAGO_LAYOUT.scale ?? 1,
    "--dock-character-rotate": THIRD_PAGE_ANAGO_LAYOUT.rotate ?? "0deg",
    "--dock-character-hide-bottom": THIRD_PAGE_ANAGO_LAYOUT.hideBottom,
  } as CSSProperties;

  return (
    <div className="onboarding-dock-artwork" aria-hidden="true">
      <div className="onboarding-dock-stage">
        {character ? (
          <div className="onboarding-dock-character-wrap" style={characterStyle}>
            <div className="onboarding-dock-character-clip">
              <img
                className="onboarding-dock-character"
                src={getCharacterImageSrc(character)}
                alt=""
                draggable={false}
              />
            </div>
          </div>
        ) : null}
        <img
          className="onboarding-dock-image"
          src="/dock1.png"
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}

function WarningArtwork({
  character,
}: {
  character: CharacterDefinition | null;
}) {
  return (
    <div className="onboarding-warning-artwork" aria-hidden="true">
      <div className="onboarding-warning-phone">
        <span className="onboarding-warning-phone-pulse onboarding-warning-phone-pulse--1" />
        <span className="onboarding-warning-phone-pulse onboarding-warning-phone-pulse--2" />
        <img
          src="/phone.png"
          alt=""
          draggable={false}
        />
      </div>
      {character ? (
        <div className="onboarding-warning-character-wrap">
          <span className="onboarding-warning-sound">プイッ</span>
          <div className="onboarding-warning-character-clip">
            <div className="onboarding-warning-character-sink">
              <img
                className="onboarding-warning-character"
                src="/characters/anago/normal-nago/expressions/bad.png"
                alt=""
                draggable={false}
              />
            </div>
          </div>
        </div>
      ) : null}
      <img
        className="onboarding-warning-dock"
        src="/dock2.png"
        alt=""
        draggable={false}
      />
    </div>
  );
}

function ReturnArtwork({
  character,
}: {
  character: CharacterDefinition | null;
}) {
  const sceneStyle = {
    "--return-character-left": percent(
      RETURN_PAGE_LAYOUT_TUNING.characterXPercent,
    ),
    "--return-character-bottom": percent(
      RETURN_PAGE_LAYOUT_TUNING.characterBottomPercent,
    ),
    "--return-character-width": percent(
      RETURN_PAGE_LAYOUT_TUNING.characterWidthPercent,
    ),
    "--return-character-scale": RETURN_PAGE_LAYOUT_TUNING.characterScale,
    "--return-character-rotate": `${RETURN_PAGE_LAYOUT_TUNING.characterRotateDeg}deg`,
    "--return-character-hide-bottom": percent(
      RETURN_PAGE_LAYOUT_TUNING.characterHideBottomPercent,
    ),
    "--return-rise-start-y": percent(
      RETURN_PAGE_LAYOUT_TUNING.characterRiseStartPercent,
    ),
    "--return-sound-gap-px": px(RETURN_PAGE_LAYOUT_TUNING.soundGapPx),
    "--return-sound-width": percent(
      RETURN_PAGE_LAYOUT_TUNING.soundWidthPercentOfCharacter,
    ),
    "--return-sound-delay": ms(RETURN_PAGE_LAYOUT_TUNING.soundDelayMs),
    "--return-sound-duration": ms(RETURN_PAGE_LAYOUT_TUNING.soundDurationMs),
  } as CSSProperties;

  return (
    <div className="onboarding-return-artwork" aria-hidden="true">
      <div className="onboarding-return-scene" style={sceneStyle}>
        <div className="onboarding-return-dock-group">
          {character ? (
            <div className="onboarding-return-character-wrap">
              <img
                className="onboarding-return-sound-text"
                src="/piiin_story.png"
                alt=""
                draggable={false}
              />
              <div className="onboarding-return-character-clip">
                <div className="onboarding-return-character-motion">
                  <img
                    className="onboarding-return-character-image"
                    src="/characters/anago/normal-nago/expressions/happy.png"
                    alt=""
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <img
            className="onboarding-return-dock"
            src="/dock2.png"
            alt=""
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

function RewardArtwork({
  character,
}: {
  character: CharacterDefinition | null;
}) {
  const cardStyle = {
    left: percent(REWARD_PAGE_LAYOUT_TUNING.cardXPercent),
    top: percent(REWARD_PAGE_LAYOUT_TUNING.cardTopPercent),
    width: responsivePxWidth({
      minPx: REWARD_PAGE_LAYOUT_TUNING.cardWidthMinPx,
      vw: REWARD_PAGE_LAYOUT_TUNING.cardWidthVw,
      dvh: REWARD_PAGE_LAYOUT_TUNING.cardWidthDvh,
      maxPx: REWARD_PAGE_LAYOUT_TUNING.cardWidthMaxPx,
    }),
    zIndex: 2,
    "--card-anim-delay": "0ms",
    "--home-character-color": character?.characterColor.primary ?? "#f05a63",
    "--home-character-soft-color": character?.characterColor.soft ?? "#f6d2d4",
    "--reward-card-scale": REWARD_PAGE_LAYOUT_TUNING.cardScale,
    "--reward-card-rotate": `${REWARD_PAGE_LAYOUT_TUNING.cardRotateDeg}deg`,
  } as CSSProperties;
  const characterStyle = {
    "--reward-character-x": percent(
      REWARD_PAGE_LAYOUT_TUNING.characterOffsetXPercent,
    ),
    "--reward-character-y": percent(
      REWARD_PAGE_LAYOUT_TUNING.characterOffsetYPercent,
    ),
    "--reward-character-scale": REWARD_PAGE_LAYOUT_TUNING.characterScale,
    "--reward-character-rotate": `${REWARD_PAGE_LAYOUT_TUNING.characterRotateDeg}deg`,
  } as CSSProperties;

  return (
    <div className="onboarding-reward-artwork" aria-hidden="true">
      <div className="home-character-slot onboarding-reward-home-slot" style={cardStyle}>
        <div className="home-character-card is-acquired onboarding-reward-home-card">
          <div className="home-character-preview onboarding-reward-preview">
            {character ? (
              <img
                className="home-card-character onboarding-reward-character"
                src={getCharacterImageSrc(character)}
                alt=""
                draggable={false}
                style={characterStyle}
              />
            ) : null}
            <span className="onboarding-reward-sparkle onboarding-reward-sparkle--1" />
            <span className="onboarding-reward-sparkle onboarding-reward-sparkle--2" />
            <span className="onboarding-reward-sparkle onboarding-reward-sparkle--3" />
          </div>
          <div className="home-character-body">
            <h3 className="home-character-name">
              {character ? character.name : "シマアナゴ"}
            </h3>
            <div className="home-character-tags">
              {(character?.personalityTags ?? ["ムードメーカー", "フレンドリー"]).map((tag) => (
                <span className="home-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FinalArtwork({ characters }: { characters: CharacterDefinition[] }) {
  const charactersById = new Map(
    characters.map((character) => [character.id, character]),
  );
  const finalCharacters = FINAL_PAGE_CHARACTER_IDS.map(
    (characterId) =>
      charactersById.get(characterId) ??
      CHARACTER_CATALOG.find((character) => character.id === characterId),
  ).filter((character): character is CharacterDefinition => Boolean(character));
  const rowStyle = {
    "--final-card-row-top": percent(FINAL_PAGE_LAYOUT_TUNING.rowTopPercent),
    "--final-card-strip-width": `min(${FINAL_PAGE_LAYOUT_TUNING.rowWidthVw}vw, ${FINAL_PAGE_LAYOUT_TUNING.rowMaxPx}px)`,
    "--final-card-gap": px(FINAL_PAGE_LAYOUT_TUNING.cardGapPx),
    "--final-card-scale": FINAL_PAGE_LAYOUT_TUNING.cardScale,
    "--final-character-x": percent(
      FINAL_PAGE_LAYOUT_TUNING.characterOffsetXPercent,
    ),
    "--final-character-y": percent(
      FINAL_PAGE_LAYOUT_TUNING.characterOffsetYPercent,
    ),
    "--final-character-scale": FINAL_PAGE_LAYOUT_TUNING.characterScale,
    "--final-card-hover-lift": px(FINAL_PAGE_LAYOUT_TUNING.hoverLiftPx),
    "--final-card-hover-scale": FINAL_PAGE_LAYOUT_TUNING.hoverScale,
  } as CSSProperties;

  return (
    <div className="onboarding-final-artwork" style={rowStyle} aria-hidden="true">
      <div className="onboarding-final-card-strip">
        {finalCharacters.map((character, index) => (
          <div
            className="home-character-slot onboarding-final-card-slot"
            key={character.id}
            style={
              {
                "--card-anim-delay": `${index * 70}ms`,
                "--home-character-color": character.characterColor.primary,
                "--home-character-soft-color": character.characterColor.soft,
              } as CSSProperties
            }
          >
            <div className="home-character-card is-acquired onboarding-final-card">
              <div className="home-character-preview onboarding-final-preview">
                <img
                  className="home-card-character onboarding-final-character"
                  src={getCharacterImageSrc(character)}
                  alt=""
                  draggable={false}
                />
              </div>
              <div className="home-character-body onboarding-final-card-body">
                <h3 className="home-character-name onboarding-final-card-name">
                  {character.name}
                </h3>
                <div className="home-character-tags">
                  {character.personalityTags.map((tag) => (
                    <span className="home-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
