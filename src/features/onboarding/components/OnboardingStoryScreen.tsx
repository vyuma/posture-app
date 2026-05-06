import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  CHARACTER_CATALOG,
  getCharacterImageSrc,
} from "../../characters/characterCatalog";
import type { CharacterDefinition } from "../../characters/types";

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

const SECOND_PAGE_CHARACTER_LAYOUTS: SecondPageCharacterLayout[] = [
  {
    characterId: "shin-anago",
    left: "16%",
    bottom: "-70%",
    width: "clamp(54px, 7vw, 92px)",
    scale: 1.4,
    zIndex: 4,
    rotate: "-2deg",
    delayMs: 0,
  },
  {
    characterId: "oto-anago",
    left: "29%",
    bottom: "-72%",
    width: "clamp(52px, 6.6vw, 88px)",
    scale: 1.4,
    zIndex: 5,
    rotate: "1deg",
    delayMs: 100,
  },
  {
    characterId: "kuro-anyago",
    left: "42%",
    bottom: "-75%",
    width: "clamp(56px, 7.2vw, 96px)",
    scale: 1.4,
    zIndex: 6,
    rotate: "-1deg",
    delayMs: 180,
  },
  {
    characterId: "normal-nago",
    left: "55%",
    bottom: "-72%",
    width: "clamp(58px, 7.4vw, 100px)",
    scale: 1.4,
    zIndex: 7,
    rotate: "1deg",
    delayMs: 260,
  },
  {
    characterId: "dot-nago",
    left: "68%",
    bottom: "-70%",
    width: "clamp(52px, 6.8vw, 90px)",
    scale: 1.4,
    zIndex: 6,
    rotate: "-1deg",
    delayMs: 340,
  },
  {
    characterId: "moja-anago",
    left: "80%",
    bottom: "-68%",
    width: "clamp(54px, 7vw, 94px)",
    scale: 1.4,
    zIndex: 5,
    rotate: "2deg",
    delayMs: 420,
  },
  {
    characterId: "hat-anago",
    left: "94%",
    bottom: "-80%",
    width: "clamp(50px, 6.4vw, 86px)",
    scale: 1.55,
    zIndex: 4,
    rotate: "1deg",
    delayMs: 500,
  },
];

const FOURTH_PAGE_ANAGO_LAYOUT: AdjustableArtworkLayout = {
  left: "52%",
  bottom: "-100%",
  width: "clamp(56px, 10vw, 104px)",
  scale: 2,
  rotate: "-7deg",
  zIndex: 3,
};

const FIFTH_PAGE_ANAGO_LAYOUT: AdjustableArtworkLayout = {
  left: "50%",
  bottom: "-120%",
  width: "clamp(70px, 11vw, 118px)",
  scale: 2.4,
  rotate: "0deg",
  zIndex: 4,
};

const SIXTH_PAGE_CARD_LAYOUT: AdjustableArtworkLayout = {
  left: "50%",
  bottom: "50%",
  width: "clamp(124px, 18vw, 178px)",
  scale: 1,
  rotate: "8deg",
  zIndex: 2,
};

const SIXTH_PAGE_ANAGO_LAYOUT: AdjustableArtworkLayout = {
  left: "50%",
  bottom: "-170%",
  width: "58%",
  scale: 2.5,
  rotate: "0deg",
  zIndex: 2,
};

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
    eyebrow: "2 / 7",
    body: [
      "彼らの名前は、ピンアナゴ。",
      "あなたのモニターに生息しています。",
    ],
    variant: "friends",
  },
  {
    id: "friends",
    eyebrow: "3 / 7",
    body: [
      "ピンアナゴは姿勢のいい人間が大好き。",
      "いい姿勢を求めて毎日新しい仲間がやってきます。",
    ],
    variant: "message",
  },
  {
    id: "warning",
    eyebrow: "4 / 7",
    body: [
      "悪い姿勢が続くと逃げてしまいます。",
      "姿勢が崩れた時は、バイブでお知らせします。",
    ],
    variant: "warning",
  },
  {
    id: "return",
    eyebrow: "5 / 7",
    body: ["あなたが背筋を伸ばすと、", "ピーンと音をたてて戻ります。"],
    variant: "return",
  },
  {
    id: "reward",
    eyebrow: "6 / 7",
    body: ["よい姿勢の条件をクリアすると、", "新しいピンアナゴをゲット！"],
    variant: "reward",
  },
  {
    id: "final",
    eyebrow: "7 / 7",
    body: [
      "ピンアナゴは全部で111種類。",
      "全種類あつめて正しい姿勢を習慣化しよう！",
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
  const isFinalSlide = slideIndex === STORY_SLIDES.length - 1;
  const featuredCharacters = useMemo(
    () => [
      CHARACTER_CATALOG[1],
      CHARACTER_CATALOG[4],
      CHARACTER_CATALOG[2],
      CHARACTER_CATALOG[0],
      CHARACTER_CATALOG[5],
      CHARACTER_CATALOG[6],
      CHARACTER_CATALOG[3],
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

  return (
    <main
      className={`onboarding-screen ${isSplashSlide ? "is-splash-active" : ""}`}
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
        <button type="button" className="onboarding-skip" onClick={onComplete}>
          スキップ
        </button>
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
                  Piin
                </h1>
                <img
                  className="onboarding-main-logo"
                  src="/logo/logo_main.svg"
                  alt=""
                  draggable={false}
                />
              </>
            ) : currentSlide.title ? (
              <h1 id="onboarding-heading">{currentSlide.title}</h1>
            ) : (
              <h1 id="onboarding-heading" className="onboarding-sr-title">
                Piin Story
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
          {STORY_SLIDES.map((slide, index) => (
            <button
              type="button"
              key={slide.id}
              className={index === slideIndex ? "is-active" : ""}
              aria-label={`${index + 1}枚目を表示`}
              aria-current={index === slideIndex ? "step" : undefined}
              onClick={() => goToSlide(index)}
            />
          ))}
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
      return <WarningArtwork character={characters[1] ?? null} />;
    case "return":
      return <ReturnArtwork character={characters[0] ?? null} />;
    case "reward":
      return <RewardArtwork character={characters[0] ?? null} />;
    case "final":
      return <FinalArtwork />;
    case "message":
      return null;
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

function WarningArtwork({
  character,
}: {
  character: CharacterDefinition | null;
}) {
  const characterStyle = {
    left: FOURTH_PAGE_ANAGO_LAYOUT.left,
    bottom: FOURTH_PAGE_ANAGO_LAYOUT.bottom,
    width: FOURTH_PAGE_ANAGO_LAYOUT.width,
    zIndex: FOURTH_PAGE_ANAGO_LAYOUT.zIndex,
    "--warning-character-scale": FOURTH_PAGE_ANAGO_LAYOUT.scale ?? 1,
    "--warning-character-rotate": FOURTH_PAGE_ANAGO_LAYOUT.rotate ?? "0deg",
  } as CSSProperties;

  return (
    <div className="onboarding-warning-artwork" aria-hidden="true">
      {/* 猫背になりかけているキャラクター */}
      {character ? (
        <div className="onboarding-warning-char" style={characterStyle}>
          <img src={getCharacterImageSrc(character)} alt="" draggable={false} />
        </div>
      ) : null}

      {/* バイブ通知カード */}
      <div className="onboarding-notif-wrap">
        <span className="onboarding-notif-wave" />
        <span className="onboarding-notif-wave onboarding-notif-wave--2" />
        <span className="onboarding-notif-wave onboarding-notif-wave--3" />
        <div className="onboarding-notif-card">
          <div className="onboarding-notif-top">
            <span className="onboarding-notif-logo">Piin</span>
            <span className="onboarding-notif-time">今</span>
          </div>
          <p className="onboarding-notif-body">姿勢が崩れています</p>
          <div className="onboarding-notif-phone-row">
            <div className="onboarding-notif-phone">
              <span />
            </div>
            <div className="onboarding-notif-vibe-lines">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReturnArtwork({
  character,
}: {
  character: CharacterDefinition | null;
}) {
  const characterStyle = {
    left: FIFTH_PAGE_ANAGO_LAYOUT.left,
    bottom: FIFTH_PAGE_ANAGO_LAYOUT.bottom,
    width: FIFTH_PAGE_ANAGO_LAYOUT.width,
    zIndex: FIFTH_PAGE_ANAGO_LAYOUT.zIndex,
    "--return-character-scale": FIFTH_PAGE_ANAGO_LAYOUT.scale ?? 1,
    "--return-character-rotate": FIFTH_PAGE_ANAGO_LAYOUT.rotate ?? "0deg",
  } as CSSProperties;

  return (
    <div className="onboarding-return-artwork" aria-hidden="true">
      <div className="onboarding-return-stage">
        <span className="onboarding-return-glow" />
        <span className="onboarding-return-ring onboarding-return-ring--1" />
        <span className="onboarding-return-ring onboarding-return-ring--2" />
        <span className="onboarding-return-ring onboarding-return-ring--3" />
        <span className="onboarding-sound-text">ピーン♪</span>
        <span className="onboarding-return-sparkle onboarding-return-sparkle--1" />
        <span className="onboarding-return-sparkle onboarding-return-sparkle--2" />
        <span className="onboarding-return-sparkle onboarding-return-sparkle--3" />
        {character ? (
          <div className="onboarding-return-character" style={characterStyle}>
            <img src={getCharacterImageSrc(character)} alt="" draggable={false} />
          </div>
        ) : null}
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
    left: SIXTH_PAGE_CARD_LAYOUT.left,
    bottom: SIXTH_PAGE_CARD_LAYOUT.bottom,
    width: SIXTH_PAGE_CARD_LAYOUT.width,
    zIndex: SIXTH_PAGE_CARD_LAYOUT.zIndex,
    "--card-anim-delay": "0ms",
    "--home-character-color": character?.characterColor.primary ?? "#f05a63",
    "--home-character-soft-color": character?.characterColor.soft ?? "#f6d2d4",
    "--reward-card-scale": SIXTH_PAGE_CARD_LAYOUT.scale ?? 1,
    "--reward-card-rotate": SIXTH_PAGE_CARD_LAYOUT.rotate ?? "0deg",
  } as CSSProperties;
  const characterStyle = {
    left: SIXTH_PAGE_ANAGO_LAYOUT.left,
    bottom: SIXTH_PAGE_ANAGO_LAYOUT.bottom,
    width: SIXTH_PAGE_ANAGO_LAYOUT.width,
    zIndex: SIXTH_PAGE_ANAGO_LAYOUT.zIndex,
    "--reward-character-scale": SIXTH_PAGE_ANAGO_LAYOUT.scale ?? 1,
    "--reward-character-rotate": SIXTH_PAGE_ANAGO_LAYOUT.rotate ?? "0deg",
  } as CSSProperties;

  return (
    <div className="onboarding-reward-artwork" aria-hidden="true">
      <div className="home-character-slot onboarding-reward-home-slot" style={cardStyle}>
        <div className="home-character-card is-acquired onboarding-reward-home-card">
          <span className="onboarding-reward-new-badge">NEW</span>
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
              {character ? character.name : "シン・アナゴ"}
            </h3>
            <div className="home-character-tags">
              {(character?.personalityTags ?? ["NEW", "姿勢"]).map((tag) => (
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

function FinalArtwork() {
  return (
    <div className="onboarding-final-artwork" aria-hidden="true">
      <span className="onboarding-crown">♛</span>
      <div className="onboarding-locked-row">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index}>?</span>
        ))}
      </div>
    </div>
  );
}
