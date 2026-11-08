import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { WEB_APP_PATH } from "../../routes";
import { CHARACTER_CATALOG } from "../characters/characterCatalog";
import { STORY_CHARACTER_CARDS } from "../characters/storyCharacterCards";
import type { CharacterDefinition } from "../characters/types";
import { BeachCharacter } from "./BeachCharacter";
import { DesktopDemo } from "./DesktopDemo";
import { GrowingPet } from "./GrowingPet";
import { CharacterStars } from "../characters/CharacterStars";
import { LandingResultCard } from "./LandingResultCard";
import "./landing.css";
import "./landing-hero.css";
import "./landing-how.css";
import "./landing-lp6.css";
import "./landing-new.css";
import "./landing-motion.css";
import { useLandingMotion } from "./useLandingMotion";
import { useCollectionDrag } from "./useCollectionDrag";

const MAC_DOWNLOAD_URL = "/api/download-mac";

// LP-6 Hero (2260:205), beach 2260:801. Coordinates translated to
// the 1512px hero canvas from the beach's (-136, 741) origin.
const HERO_CHARACTERS = [
  { image: "oto", name: "オトアナゴ", x: 204, bottom: 56.8, width: 99.17, height: 159.2, flip: true, back: true },
  { image: "shima", name: "シマアナゴ", x: 1200, bottom: 85.93, width: 89.04, height: 143.07, back: true },
  { image: "twin", name: "ツインナゴ", x: 520, bottom: 67.12, width: 85.8, height: 137.88, back: true },
  { image: "pine", name: "パインナゴ", x: 889, bottom: 65.4, width: 93.81, height: 150.6, flip: true, back: true },
  { image: "nasubi", name: "ナスビナゴ", x: 64, bottom: 12.31, width: 101.25, height: 162.69, flip: true },
  { image: "kuro", name: "クロアニャゴ", x: 342, bottom: 2.18, width: 105.16, height: 168.82, flip: true },
  { image: "shin", name: "シン・アナゴ", x: 1052, bottom: 37.18, width: 92.7, height: 148.82 },
  { image: "hat", name: "ハットナゴ", x: 700, bottom: 57.18, width: 99.56, height: 159.82 },
  { image: "moja", name: "モジャアナゴ", x: 1369, bottom: 25.59, width: 90.58, height: 145.41 },
];

const CONCERN_QUOTES = [
  "体に良くないとは思いつつ、何もしていない...",
  "気をつけていても、気づけば猫背に...",
  "アプリを試したけど、結局続かず...",
] as const;

const CHARACTER_BY_ID = new Map(
  CHARACTER_CATALOG.map((character) => [character.id, character]),
);

function getCharacter(id: string): CharacterDefinition {
  const character = CHARACTER_BY_ID.get(id);
  if (!character) {
    throw new Error(`LP character is missing from the catalog: ${id}`);
  }
  return character;
}

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <span className={`lp-brand-mark${light ? " lp-brand-mark--light" : ""}`}>
      <img src={`/lp/lp6/logo-${light ? "white" : "gray"}.png`} alt="PiiiN" draggable={false} />
    </span>
  );
}

function DownloadDialog({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    closeButtonRef.current?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="lp-download-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="lp-download-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-download-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          className="lp-dialog-close"
          type="button"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>
        <p className="lp-dialog-eyebrow">DESKTOP APP</p>
        <h2 id="lp-download-title">PiiiNをダウンロード</h2>
        <p className="lp-dialog-copy">
          お使いのPCに合わせてお選びください。ブラウザー版はインストールせずに体験できます。
        </p>
        <div className="lp-download-options">
          <a
            className="lp-download-option lp-download-option--mac"
            href={MAC_DOWNLOAD_URL}
          >
            <span className="lp-download-platform">macOS</span>
            <strong>Mac版をダウンロード</strong>
            <span>Apple Silicon・Intel対応</span>
          </a>
          <div
            className="lp-download-option lp-download-option--pending"
            aria-disabled="true"
          >
            <span className="lp-download-platform">Windows</span>
            <strong>Microsoft Storeでの公開準備中</strong>
            <span>公開後、このページからご案内します</span>
          </div>
        </div>
        <a className="lp-dialog-web-link" href={WEB_APP_PATH}>
          WEB版を体験する
        </a>
      </section>
    </div>
  );
}

function CharacterBed({
  className = "",
}: {
  className?: string;
}) {
  const characters = HERO_CHARACTERS;
  const sceneHeight = 229;
  return (
    <div className={`lp-character-bed ${className}`.trim()}>
      <div className="lp-beach-scene">
        {characters.map((character) => (
          <BeachCharacter
            key={character.image}
            image={character.image}
            name={character.name}
            flip={character.flip}
            style={{
              left: `${(character.x / 1512) * 100}%`,
              bottom: `${(character.bottom / sceneHeight) * 100}%`,
              width: `${(character.width / 1512) * 100}%`,
              height: `${(character.height / sceneHeight) * 100}%`,
              zIndex: character.back ? 1 : 3,
            }}
          />
        ))}
      </div>
      <span className="lp-beach-sand lp-beach-sand--back" />
      <span className="lp-beach-sand lp-beach-sand--front" />
    </div>
  );
}

function LandingHeader({ onDownload }: { onDownload: () => void }) {
  return (
    <header className="lp-header">
      <a href="#top" className="lp-header-logo" aria-label="PiiiN ページ上部へ">
        <BrandMark light />
      </a>
      <nav aria-label="メインナビゲーション">
        <a className="lp-header-web" href={WEB_APP_PATH}>
          WEBで体験する
        </a>
        <button
          className="lp-header-download"
          type="button"
          onClick={onDownload}
        >
          <span>アプリをダウンロード</span>
        </button>
      </nav>
    </header>
  );
}

function Hero({ onDownload }: { onDownload: () => void }) {
  return (
    <section className="lp-hero" id="top">
      <LandingHeader onDownload={onDownload} />
      <div className="lp-hero-content">
        <div className="lp-hero-brand">
          <h1 className="lp-hero-title">
            <img
              className="lp-hero-logo"
              src="/lp/lp6/logo-white.png"
              alt="姿勢改善にワクワクを PiiiN（ピーン）"
              draggable={false}
            />
          </h1>
          <div className="lp-hero-actions">
            <button
              type="button"
              className="lp-hero-download"
              onClick={onDownload}
            >
              アプリをダウンロード
            </button>
            <a className="lp-hero-web" href={WEB_APP_PATH}>
              WEBで体験する
            </a>
          </div>
        </div>
        <DesktopDemo className="lp-hero-laptop" />
      </div>
      <CharacterBed className="lp-character-bed--hero" />
    </section>
  );
}

function ConceptStory() {
  return (
    <section className="lp6-concept" id="about" aria-labelledby="lp6-concern-heading">
      <div className="lp6-concept-inner">
        <div className="lp6-concerns">
          <h2 id="lp6-concern-heading">こんなお悩みありませんか？</h2>
          <div className="lp6-concern-scene">
            {CONCERN_QUOTES.map((quote, index) => (
              <p className={`lp6-concern lp6-concern--${index + 1}`} key={quote}>{quote}</p>
            ))}
            <div className="lp6-thought-dots" aria-hidden>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
            <img className="lp6-worried-people" src="/lp/lp6/worried-people.png" alt="姿勢に悩むデスクワーカー" />
          </div>
        </div>
        <div className="lp6-concept-copy">
          <p>姿勢が悪いとわかっていても、<br />正しい姿勢を続けるのって、けっこう難しい。</p>
          <p className="lp6-concept-lead"><BrandMark />は、そんなデスクワーカーにピッタリの</p>
          <h2><em>続けたくなる</em> 姿勢改善アプリです。</h2>
        </div>
        <img className="lp6-concept-arrow" src="/lp/lp6/concept-arrow.svg" alt="" />
      </div>
    </section>
  );
}

const MECHANISM_STEPS = [
  { id: "bad", title: "姿勢が崩れると…", caption: "怒る", speech: "姿勢を戻して！", posture: "bad" },
  { id: "straight", title: "悪い姿勢が続くと…", caption: "どんどん大きくなる！", speech: "", posture: null },
  { id: "normal", title: "姿勢を正すと…", caption: "褒める", speech: "いい感じ！", posture: "good" },
] as const;

function MechanismCard({ step }: { step: (typeof MECHANISM_STEPS)[number] }) {
  return (
    <article className={`lp6-mechanism lp6-mechanism--${step.id}`}>
      <h3>{step.title}</h3>
      {step.posture && <img className="lp6-posture-person" src={`/lp/posture-${step.posture}.png`} alt="" />}
      {step.id === "straight" ? <GrowingPet /> : <img className="lp-example-pet-art" src={`/lp/new/posture-${step.id}.svg`} alt={step.speech} loading="lazy" draggable={false} />}
      <strong>{step.caption}</strong>
      {step.id !== "normal" && <div className="lp6-mechanism-arrows" aria-hidden><img src="/lp/lp6/mechanism-arrow.svg" alt="" /><img src="/lp/lp6/mechanism-arrow.svg" alt="" /></div>}
    </article>
  );
}

function CollectionRail() {
  const railRef = useCollectionDrag();
  return (
    <div className="lp-collection-gallery">
      <div
        ref={railRef}
        className="lp-collection-rail"
        role="region"
        aria-label="ピンアナゴの一例。左右にドラッグ・スワイプ、または左右の矢印キーでカードを送れます。"
        tabIndex={0}
      >
        <div className="lp-collection-track">
          {[0, 1, 2, 3].map((copy) => (
            <div
              className="lp-collection-group"
              key={copy}
              aria-hidden={copy > 0 ? true : undefined}
            >
              {STORY_CHARACTER_CARDS.map((card) => (
                <article
                  className="lp-collection-card"
                  key={card.characterId}
                  style={
                    {
                      "--lp-tag-color": card.primaryColor,
                      "--lp-card-soft": card.previewColor,
                    } as CSSProperties
                  }
                >
                  <div>
                    <img
                      src={
                        card.imageSrc ??
                        getCharacter(card.characterId).portraitSrc
                      }
                      alt=""
                      draggable={false}
                    />
                  </div>
                  <h3>{card.displayName}</h3>
                  <CharacterStars characterId={card.characterId} />
                  <ul>
                    {card.personalityTags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const HOW_TO_STEPS = [
  { number: "1", title: "タイマーをセット", description: "ポモドーロタイマーで\n作業の集中もサポートします。" },
  { number: "2", title: "正しい姿勢を登録", description: "姿勢のガイドラインを見ながら\n基準となる姿勢を登録します。" },
  { number: "3", title: "作業スタート！", description: "リアルタイムで姿勢を測定。\nボタンでいつでも中断できます。" },
] as const;

function PointHeading({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return <header className="lp6-point-heading"><p className="lp6-point-label">ポイント {number}</p><h2>{title}</h2><p className="lp6-point-description">{children}</p></header>;
}

function AboutSection() {
  return (
    <>
      <ConceptStory />
      <section className="lp6-about" aria-label="続けたくなるヒミツ">
        <div className="lp6-secret-intro">
          <p className="lp6-secret-label">続けたくなるヒミツ</p>
          <div className="lp6-seven-anago" aria-hidden>
            {["shin", "oto", "kuro", "shima", "kuma", "moja", "hat"].map(name => <img key={name} src={name === "kuma" ? "/lp/lp6/kuma.png" : `/lp/bed-${name}.png`} alt="" draggable={false} />)}
          </div>
          <p className="lp6-secret-eyebrow">姿勢改善を見守ってくれるキャラクター</p>
          <h2>ピンアナゴ</h2>
        </div>
        <section className="lp6-point lp6-point--desktop">
          <div className="lp6-point-inner">
            <PointHeading number={1} title="いつでも見守ってくれる">ポモドーロタイマー付きのウィジェットをご用意。<br />ピンアナゴがあなたの姿勢を常時チェックしてくれます。</PointHeading>
            <div className="lp6-point-laptop">
              <DesktopDemo />
              <p className="lp6-position-bubble">表示位置は<br />自由に設定可能</p>
            </div>
          </div>
        </section>
        <section className="lp6-point lp6-point--posture">
          <div className="lp6-point-inner">
            <PointHeading number={2} title="姿勢が悪くなると怒ってくれる">ピンアナゴは姿勢がいい人間が大好き。<br />姿勢を正すと褒めてくれますが、<br />姿勢が悪いと真っ赤になってカンカンに怒ります。</PointHeading>
            <div className="lp6-mechanism-grid">{MECHANISM_STEPS.map(step => <MechanismCard key={step.id} step={step} />)}</div>
          </div>
        </section>
        <section className="lp6-point lp6-point--acquisition">
          <div className="lp6-point-inner">
            <PointHeading number={3} title="姿勢がいいと新しい仲間を連れてくる">ピーン率（判定できた時間のうち良い姿勢だった割合）が50％以上になると、<br />まだ出会っていないピンアナゴを獲得できます。</PointHeading>
            <LandingResultCard />
          </div>
        </section>
        <div className="lp6-collection">
          <div className="lp-collection-copy">
            <h2>出会えるピンアナゴは <span className="lp-collection-count">{CHARACTER_CATALOG.length}種類 </span>！</h2>
            <p>仲間を集めながら、毎日の姿勢を意識してみよう。</p>
          </div>
          <CollectionRail />
          <p className="lp-collection-rare">次はどんな仲間に出会えるかな？</p>
        </div>
      </section>
    </>
  );
}

function HowToSection() {
  return (
    <section className="lp-how" id="how-to">
      <div className="lp-how-inner">
        <h2>
          <BrandMark light />
          <span>の使い方</span>
        </h2>
        <div className="lp-how-list">
          {HOW_TO_STEPS.map((step) => (
            <article className="lp-how-step" key={step.number}>
              <header>
                <span aria-hidden="true">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </header>
              <div className={`lp-how-devices lp-how-devices--${step.number}`} role="img" aria-label={`${step.title}の画面例`}>
                {step.number === "2" && <img className="lp-how-laptop-shell" src="/lp/new/how-laptop.png" alt="" loading="lazy" draggable={false} />}
                <img className="lp-how-screen-art" src="/lp/new/how-screens.png" alt="" loading="lazy" draggable={false} />
              </div>
            </article>
          ))}
        </div>
        <a
          className="lp-video-link"
          href="https://www.youtube.com/watch?v=TaxlBOoPM9Q&t=47s"
          target="_blank"
          rel="noreferrer"
        >
          <img src="/lp/video-icon.svg" alt="" aria-hidden />使い方の動画を見る
        </a>
      </div>
    </section>
  );
}

function FinalCta({ onDownload }: { onDownload: () => void }) {
  return (
    <section className="lp-final-cta">
      <h2>ピンアナゴたちと一緒に、<br />姿勢改善を習慣化しましょう！</h2>
      <div className="lp-final-cta-buttons">
        <a href={WEB_APP_PATH}>WEBで体験する</a>
        <button type="button" onClick={onDownload}>
          アプリをダウンロード
        </button>
      </div>
      <CharacterBed className="lp-character-bed--footer" />
    </section>
  );
}

function LandingFooter({ onDownload }: { onDownload: () => void }) {
  return (
    <footer className="lp-footer">
      <BrandMark />
      <nav aria-label="フッターナビゲーション">
        <a href="#about">PiiiNとは</a>
        <a href="#how-to">使い方</a>
        <a href="/privacy">プライバシーポリシー</a>
        <a href="/support">サポート</a>
        <a href={WEB_APP_PATH}>WEBで体験する</a>
        <button type="button" onClick={onDownload}>
          アプリをダウンロード
        </button>
      </nav>
    </footer>
  );
}

export function LandingPage() {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  useLandingMotion(pageRef);

  useEffect(() => {
    document.documentElement.classList.add("lp-document");
    document.body.classList.add("lp-document");
    return () => {
      document.documentElement.classList.remove("lp-document");
      document.body.classList.remove("lp-document");
    };
  }, []);

  const openDownload = () => setDownloadOpen(true);

  return (
    <div
      className="landing-page"
      ref={pageRef}
      onDragStartCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && (target.tagName === "IMG" || target.closest(".lp-collection-rail, .lp-beach-character"))) {
          event.preventDefault();
        }
      }}
      onContextMenu={(event) => {
        if (event.target instanceof Element && event.target.closest(".lp-collection-rail, .lp-beach-character")) {
          event.preventDefault();
        }
      }}
    >
      <main>
        <Hero onDownload={openDownload} />
        <AboutSection />
        <HowToSection />
        <FinalCta onDownload={openDownload} />
      </main>
      <LandingFooter onDownload={openDownload} />
      {downloadOpen ? (
        <DownloadDialog onClose={() => setDownloadOpen(false)} />
      ) : null}
    </div>
  );
}
