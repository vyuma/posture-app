import { t, useAppLanguage } from "../i18n";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { WEB_APP_PATH } from "../../routes";
import { CHARACTER_CATALOG } from "../characters/characterCatalog";
import STORY_CARDS from "../onboarding/storyCards.json";
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

function BrandMark({ light = false }: { light?: boolean }) {
  useAppLanguage();
  return (
    <span className={`lp-brand-mark${light ? " lp-brand-mark--light" : ""}`}>
      <img src={`/lp/lp6/logo-${light ? "white" : "gray"}.png`} alt="PiiiN" draggable={false} />
    </span>
  );
}

function DownloadDialog({ onClose }: { onClose: () => void }) {
  useAppLanguage();
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
          aria-label={t("閉じる")}
        >
          ×
        </button>
        <p className="lp-dialog-eyebrow">DESKTOP APP</p>
        <h2 id="lp-download-title">{t("PiiiNをダウンロード")}</h2>
        <p className="lp-dialog-copy">
          {t("お使いのPCに合わせてお選びください。ブラウザー版はインストールせずに体験できます。")}</p>
        <div className="lp-download-options">
          <a
            className="lp-download-option lp-download-option--mac"
            href={MAC_DOWNLOAD_URL}
          >
            <span className="lp-download-platform">macOS</span>
            <strong>{t("Mac版をダウンロード")}</strong>
            <span>{t("Apple Silicon・Intel対応")}</span>
          </a>
          <div
            className="lp-download-option lp-download-option--pending"
            aria-disabled="true"
          >
            <span className="lp-download-platform">Windows</span>
            <strong>{t("Microsoft Storeでの公開準備中")}</strong>
            <span>{t("公開後、このページからご案内します")}</span>
          </div>
        </div>
        <a className="lp-dialog-web-link" href={WEB_APP_PATH}>
          {t("WEB版を体験する")}</a>
      </section>
    </div>
  );
}

function CharacterBed({
  className = "",
}: {
  className?: string;
}) {
  useAppLanguage();
  const characters = HERO_CHARACTERS;
  const sceneHeight = 229;
  return (
    <div className={`lp-character-bed ${className}`.trim()}>
      <div className="lp-beach-scene">
        {characters.map((character) => (
          <BeachCharacter
            key={character.image}
            image={character.image}
            name={t(character.name)}
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
  useAppLanguage();
  return (
    <header className="lp-header">
      <a href="#top" className="lp-header-logo" aria-label={t("PiiiN ページ上部へ")}>
        <BrandMark light />
      </a>
      <nav aria-label={t("メインナビゲーション")}>
        <a className="lp-header-web" href={WEB_APP_PATH}>
          {t("WEBで体験する")}</a>
        <button
          className="lp-header-download"
          type="button"
          onClick={onDownload}
        >
          <span>{t("アプリをダウンロード")}</span>
        </button>
      </nav>
    </header>
  );
}

function Hero({ onDownload }: { onDownload: () => void }) {
  useAppLanguage();
  return (
    <section className="lp-hero" id="top">
      <LandingHeader onDownload={onDownload} />
      <div className="lp-hero-content">
        <div className="lp-hero-brand">
          <h1 className="lp-hero-title">
            <img
              className="lp-hero-logo"
              src="/lp/lp6/logo-white.png"
              alt={t("姿勢改善にワクワクを PiiiN（ピーン）")}
              draggable={false}
            />
          </h1>
          <div className="lp-hero-actions">
            <button
              type="button"
              className="lp-hero-download"
              onClick={onDownload}
            >
              {t("アプリをダウンロード")}</button>
            <a className="lp-hero-web" href={WEB_APP_PATH}>
              {t("WEBで体験する")}</a>
          </div>
        </div>
        <DesktopDemo className="lp-hero-laptop" />
      </div>
      <CharacterBed className="lp-character-bed--hero" />
    </section>
  );
}

function ConceptStory() {
  useAppLanguage();
  return (
    <section className="lp6-concept" id="about" aria-labelledby="lp6-concern-heading">
      <div className="lp6-concept-inner">
        <div className="lp6-concerns">
          <h2 id="lp6-concern-heading">{t("こんなお悩みありませんか？")}</h2>
          <div className="lp6-concern-scene">
            {CONCERN_QUOTES.map((quote, index) => (
              <p className={`lp6-concern lp6-concern--${index + 1}`} key={quote}>{t(quote)}</p>
            ))}
            <div className="lp6-thought-dots" aria-hidden>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
            <img className="lp6-worried-people" src="/lp/lp6/worried-people.png" alt={t("姿勢に悩むデスクワーカー")} />
          </div>
        </div>
        <div className="lp6-concept-copy">
          <p>{t("姿勢が悪いとわかっていても、")}<br />{t("正しい姿勢を続けるのって、けっこう難しい。")}</p>
          <p className="lp6-concept-lead"><BrandMark />{t("は、そんなデスクワーカーにピッタリの")}</p>
          <h2><em>{t("続けたくなる")}</em> {t("姿勢改善アプリです。")}</h2>
        </div>
        <img className="lp6-concept-arrow" src="/lp/lp6/concept-arrow.svg" alt="" />
      </div>
    </section>
  );
}

const MECHANISM_STEPS = [
  { id: "bad", title: "姿勢が崩れると…", caption: "姿勢のズレをお知らせ！", speech: "首が曲がってるよ！", posture: "bad" },
  { id: "straight", title: "通知に気が付かないと…", caption: "からだが巨大化！", speech: "首が曲がってるよ！", posture: null },
  { id: "normal", title: "姿勢を正すと…", caption: "褒めてくれる！", speech: "いい感じ！", posture: "good" },
] as const;

function MechanismCard({ step }: { step: (typeof MECHANISM_STEPS)[number] }) {
  useAppLanguage();
  return (
    <article className={`lp6-mechanism lp6-mechanism--${step.id}`}>
      <h3>{t(step.title)}</h3>
      {step.posture && <img className="lp6-posture-person" src={`/lp/posture-${step.posture}.png`} alt="" />}
      {step.id === "straight" ? <GrowingPet speech={step.speech} /> : <img className="lp-example-pet-art" src={`/lp/new/posture-${step.id === "bad" ? "warning" : "normal"}-current.jpg`} alt={t(step.speech)} loading="lazy" draggable={false} />}
      <strong>{t(step.caption)}</strong>
      {step.id !== "normal" && <div className="lp6-mechanism-arrows" aria-hidden><img src="/lp/lp6/mechanism-arrow.svg" alt="" /><img src="/lp/lp6/mechanism-arrow.svg" alt="" /></div>}
    </article>
  );
}

function CollectionRail() {
  useAppLanguage();
  const railRef = useCollectionDrag();
  return (
    <div className="lp-collection-gallery">
      <div
        ref={railRef}
        className="lp-collection-rail"
        role="region"
        aria-label={t("ピンアナゴの一例。左右にドラッグ・スワイプ、または左右の矢印キーでカードを送れます。")}
        tabIndex={0}
      >
        <div className="lp-collection-track">
          {[0, 1, 2, 3].map((copy) => (
            <div
              className="lp-collection-group"
              key={copy}
              aria-hidden={copy > 0 ? true : undefined}
            >
              {STORY_CARDS.map((card, i) => (
                <article
                  className="lp-collection-card"
                  key={card.characterId}
                  style={
                    {
                      "--lp-tag-color": card.color,
                      "--lp-card-soft": card.background,
                    } as CSSProperties
                  }
                >
                  <div>
                    <img
                      className={i === 0 || i === 7 ? "is-new-character" : undefined}
                      src={card.src}
                      alt=""
                      draggable={false}
                    />
                  </div>
                  <h3>{t(card.name)}</h3>
                  <CharacterStars characterId={card.characterId} />
                  <ul>
                    {card.tags.map((tag) => (
                      <li key={tag}>{t(tag)}</li>
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
  useAppLanguage();
  return <header className="lp6-point-heading"><p className="lp6-point-label">{t("ポイント")}{number}</p><h2>{title}</h2><p className="lp6-point-description">{children}</p></header>;
}

function AboutSection() {
  useAppLanguage();
  return (
    <>
      <ConceptStory />
      <section className="lp6-about" aria-label={t("続けたくなるヒミツ")}>
        <div className="lp6-secret-intro">
          <p className="lp6-secret-label">{t("続けたくなるヒミツ")}</p>
          <div className="lp6-seven-anago" aria-hidden>
            {["shin", "oto", "kuro", "shima", "kuma", "moja", "hat"].map(name => <img key={name} src={name === "kuma" ? "/lp/lp6/kuma.png" : `/lp/bed-${name}.png`} alt="" draggable={false} />)}
          </div>
          <p className="lp6-secret-eyebrow">{t("姿勢改善を見守ってくれるキャラクター")}</p>
          <h2>{t("ピンアナゴ")}</h2>
        </div>
        <section className="lp6-point lp6-point--desktop">
          <div className="lp6-point-inner">
            <PointHeading number={1} title={t("常に画面上にいてくれる")}>{t("ポモドーロタイマー付きのウィジェットをご用意。")}<br />{t("ピンアナゴがあなたの姿勢を常時チェックしてくれます。")}</PointHeading>
            <div className="lp6-point-laptop">
              <DesktopDemo />
              <p className="lp6-position-bubble">{t("表示位置は")}<br />{t("自由に設定可能")}</p>
            </div>
          </div>
        </section>
        <section className="lp6-point lp6-point--posture">
          <div className="lp6-point-inner">
            <PointHeading number={2} title={t("正しい姿勢に導いてくれる")}>{t("姿勢が崩れると、ピンアナゴが体を大きくしてお知らせします。")}<br />{t("さらに、どこを直せばいいかもピンポイントで教えてくれます。")}<br />{t("正しい姿勢に戻ると、褒めてくれるのも嬉しいポイントです。")}</PointHeading>
            <div className="lp6-mechanism-grid">{MECHANISM_STEPS.map(step => <MechanismCard key={step.id} step={step} />)}</div>
          </div>
        </section>
        <section className="lp6-point lp6-point--acquisition">
          <div className="lp6-point-inner">
            <PointHeading number={3} title={t("がんばった分だけ仲間が増える")}>{t("ピーン率（正しい姿勢を継続できた割合）が50％を超えると、")}<br />{t("ピンアナゴが新しい仲間を連れてきてくれます。")}</PointHeading>
            <LandingResultCard />
          </div>
        </section>
        <div className="lp6-collection">
          <div className="lp-collection-copy">
            <h2>{t("出会えるピンアナゴは")}<span className="lp-collection-count">{CHARACTER_CATALOG.length}{t("種類")}</span>！</h2>
            <p>{t("仲間を集めながら、毎日の姿勢を意識してみよう。")}</p>
          </div>
          <CollectionRail />
          <p className="lp-collection-rare">{t("ピーン率が高いと、レアなピンアナゴにも出会えるかも…？")}</p>
        </div>
      </section>
    </>
  );
}

function HowToSection() {
  useAppLanguage();
  return (
    <section className="lp-how" id="how-to">
      <div className="lp-how-inner">
        <h2>
          <BrandMark light />
          <span>{t("の使い方")}</span>
        </h2>
        <div className="lp-how-list">
          {HOW_TO_STEPS.map((step) => (
            <article className="lp-how-step" key={step.number}>
              <header>
                <span aria-hidden="true">{step.number}</span>
                <div>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.description)}</p>
                </div>
              </header>
              <div className={`lp-how-devices lp-how-devices--${step.number}`} role="img" aria-label={t("{0}の画面例", { 0: t(step.title) })}>
                <img className="lp-how-laptop-shell" src="/lp/new/how-laptop.png" alt="" loading="lazy" draggable={false} />
                <img className="lp-how-current-screen" src={`/lp/new/how-${step.number}-current.jpg`} alt="" loading="lazy" draggable={false} />
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
          <img src="/lp/video-icon.svg" alt="" aria-hidden />{t("使い方の動画を見る")}</a>
      </div>
    </section>
  );
}

function FinalCta({ onDownload }: { onDownload: () => void }) {
  useAppLanguage();
  return (
    <section className="lp-final-cta">
      <h2>{t("ピンアナゴたちと一緒に、")}<br />{t("姿勢改善を習慣化しましょう！")}</h2>
      <div className="lp-final-cta-buttons">
        <a href={WEB_APP_PATH}>{t("WEBで体験する")}</a>
        <button type="button" onClick={onDownload}>
          {t("アプリをダウンロード")}</button>
      </div>
      <CharacterBed className="lp-character-bed--footer" />
    </section>
  );
}

function LandingFooter({ onDownload }: { onDownload: () => void }) {
  useAppLanguage();
  return (
    <footer className="lp-footer">
      <BrandMark />
      <nav aria-label={t("フッターナビゲーション")}>
        <a href="#about">{t("PiiiNとは")}</a>
        <a href="#how-to">{t("使い方")}</a>
        <a href="/privacy">{t("プライバシーポリシー")}</a>
        <a href="/support">{t("サポート")}</a>
        <a href={WEB_APP_PATH}>{t("WEBで体験する")}</a>
        <button type="button" onClick={onDownload}>
          {t("アプリをダウンロード")}</button>
      </nav>
    </footer>
  );
}

export function LandingPage() {
  useAppLanguage();
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
