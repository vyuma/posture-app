import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { Brand } from "../../work/Brand";

import CARDS from "../storyCards.json";
import { CharacterStars } from "../../characters/CharacterStars";
import { StoryAnago } from "./StoryAnago";
import { useStoryCardDrag } from "../useStoryCardDrag";

type Scene = "splash" | "intro" | "happy" | "angry" | "friends" | "collection";
const SCENES: Scene[] = ["splash", "intro", "happy", "angry", "friends", "collection"];
const COPY: Record<Exclude<Scene, "splash">, readonly [string, string]> = {
  intro: ["はじめまして、ボクはピンアナゴ。", "キミの姿勢をチェックしにきたよ！"],
  happy: ["ボクは姿勢のいいニンゲンが", "大好きなんだ！"],
  angry: ["姿勢が悪いニンゲンには", "厳しくいかせてもらうよ！"],
  friends: ["ピーン率（正しい姿勢を継続できた割合）が50％以上になると、", "新しい仲間をここに連れてくるよ！"],
  collection: ["毎日コツコツ続けていけば、", "いろんなピンアナゴが仲間になるよ！"],
};
const portrait = (id: string) => `/characters/anago/${id}/portrait.png`;
const FRIENDS = ["shin-anago", "oto-anago", "kuro-anyago", "normal-nago", "dot-nago", "moja-anago", "hat-anago"];


export function OnboardingStoryScreen({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const [destination, setDestination] = useState<Scene | null>(null);
  const leaving = destination !== null;
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completing = useRef(false);
  const screen = useRef<HTMLElement>(null);
  const scene = SCENES[index];
  const isLast = index === SCENES.length - 1;
  const move = useCallback((target: number) => {
    if (transitionTimer.current || completing.current || screen.current?.closest('[inert]') || target === index) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIndex(target);
      return;
    }
    setDestination(SCENES[target]);
    // Keep the current scene mounted for its outro, including the shared Lottie rig.
    transitionTimer.current = setTimeout(() => {
      setIndex(target);
      setDestination(null);
      transitionTimer.current = null;
    }, scene === 'friends' ? 220 : 180);
  }, [index, scene]);
  const next = useCallback(() => {
    if (transitionTimer.current || completing.current || screen.current?.closest('[inert]')) return;
    if (isLast) { completing.current = true; onComplete(); }
    else move(index + 1);
  }, [index, isLast, move, onComplete]);
  const previous = useCallback(() => move(Math.max(0, index - 1)), [index, move]);

  useEffect(() => () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); }, []);

  useLayoutEffect(() => {
    const element = screen.current;
    if (!element) return;
    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      // Update only layout variables while dragging a window edge. The mounted
      // Lottie rig and the current scene keep their playback state.
      element.style.setProperty("--story-scale", String(Math.min(width / 1512, height / 982)));
      element.style.setProperty("--portrait-pet-scale", String(Math.min(0.8, width / 600)));
      element.style.setProperty("--friends-scale", String(Math.min(1, (width - 32) / 1263)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    screen.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [index]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true], [data-story-gallery]")) return;
      // Let native buttons handle Space/Enter once, including the Back button.
      if (event.key === "ArrowRight" || (event.key === " " && !(event.target instanceof HTMLButtonElement))) {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, previous]);

  return (
    <main ref={screen} className={`onboarding-screen onboarding--${scene}`} data-leaving={leaving || undefined} data-destination={destination ?? undefined} aria-label="PiiiN ストーリー" aria-busy={leaving}>
      <div className="onboarding-bubbles" aria-hidden="true">
        {Array.from({ length: 11 }, (_, i) => <span key={i} />)}
      </div>
      {scene !== "splash" && <header className="onboarding-header"><Brand /></header>}
      <div className="onboarding-canvas">
        {scene === "splash" ? (
          <section className="onboarding-splash" aria-label="姿勢改善にワクワクを">
            <img className="onboarding-main-logo" src="/logo/logo_main.png" alt="姿勢改善にワクワクを PiiiN" draggable={false} />
            <button className="onboarding-start" type="button" onClick={next} aria-disabled={leaving}>はじめる</button>
          </section>
        ) : (
          <>
            <div className="onboarding-header-space" aria-hidden="true" />
            <div className="onboarding-copy" key={scene} role="status" aria-live="polite" aria-atomic="true">
              <span className="onboarding-sr-only">ストーリー {index} / 5。</span>
              {COPY[scene].map((line, i) => (
                <p key={line} style={{ "--line-delay": `${140 + i * 110}ms` } as CSSProperties}>
                  {scene === "friends" && i === 0 ? <>ピーン率<small>（正しい姿勢を継続できた割合）</small><span className="onboarding-copy-phrase">が50％以上になると、</span></> : line}
                </p>
              ))}
            </div>
            {index <= 3 && <Hero scene={scene} />}
            {scene === "friends" && (
              <div className="onboarding-friends-stage" aria-hidden="true"><div className="onboarding-friends">
                {FRIENDS.map((id, i) => <img key={id} src={portrait(id)} alt="" draggable={false} style={{ left: `${169 * i}px`, "--character-delay": `${[0, 100, 180, 260, 340, 420, 500][i]}ms` } as CSSProperties} />)}
              </div></div>
            )}
            {scene === "collection" && <Collection />}
          </>
        )}
      </div>
      <nav className="onboarding-navigation" aria-label="ストーリーの操作" hidden={scene === "splash"}>
        {index > 1 && <button type="button" className="onboarding-arrow onboarding-arrow--back" onClick={previous} aria-disabled={leaving} aria-label="前のストーリーへ"><img src="/story/redesign/arrow-back.svg" alt="" /></button>}
        <button type="button" className="onboarding-arrow onboarding-arrow--next" onClick={next} aria-disabled={leaving} aria-label={isLast ? "ストーリーを終了" : "次のストーリーへ"}><img src="/story/redesign/arrow-back.svg" alt="" /></button>
      </nav>
    </main>
  );
}

function Hero({ scene }: { scene: Scene }) {
  return (
    <div className={`onboarding-hero${scene === "intro" ? " is-entering" : ""}`} aria-hidden="true">
      <div className="onboarding-hero-motion">
        <div className="onboarding-expression is-visible">
          <StoryAnago pose={scene === "intro" ? "intro" : scene === "angry" ? "angry" : "happy"} />
        </div>
      </div>
    </div>
  );
}

function Collection() {
  const railRef = useStoryCardDrag();
  return (
    <div ref={railRef} className="onboarding-gallery" data-story-gallery tabIndex={0} role="region" aria-label="ピンアナゴの仲間。左右にドラッグ、または左右の矢印キーで移動できます。フォーカス中やカードに触れている間は自動移動が止まります。">
      <div className="onboarding-card-track">
        {[0, 1, 2, 3].map((copy) => (
          <div className="onboarding-card-group" key={copy} aria-hidden={copy !== 1 || undefined}>
            {CARDS.map((card, i) => (
              <article className="onboarding-card-slot" key={card.name} style={{ "--card-color": card.color, "--card-background": card.background } as CSSProperties}>
                <div className="onboarding-card">
                  <div className="onboarding-card-portrait"><img className={i === 0 || i === 7 ? "is-new-character" : undefined} src={card.src} alt="" draggable={false} /></div>
                  <h2>{card.name}</h2>
                  <CharacterStars characterId={card.characterId} />
                  <div className="onboarding-card-tags">{card.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
