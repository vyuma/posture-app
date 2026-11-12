import { useEffect, useRef, useState } from "react";
import { LandingPetDemo } from "./LandingPetDemo";

/** Figma's desktop assets with the same pose transitions used by the product. */
export function DesktopDemo({ className = "" }: { className?: string }) {
  const screenRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const resize = new ResizeObserver(([entry]) => {
      screen.style.setProperty("--desktop-scale", String(entry.contentRect.width / 577.622));
    });
    resize.observe(screen);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      setActive(visible && !document.hidden && !reduced.matches);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= .5;
      update();
    }, { threshold: [0, .5] });
    observer.observe(screen);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      resize.disconnect();
      observer.disconnect();
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <div className={`lp-desktop-demo ${className}`} role="group" aria-label="ポモドーロタイマー付きのピンアナゴをデスクトップに表示した例。">
      <img className="lp-desktop-shell" src="/lp/hero-macbook.png" alt="" draggable={false} />
      <div className="lp-desktop-screen" ref={screenRef}>
        <div className="lp-desktop-surface">
          <img className="lp-desktop-wallpaper" src="/lp/lp6/wallpaper.png" alt="" />
          <img className="lp-desktop-menubar" src="/lp/lp6/menubar.png" alt="" />
          <LandingPetDemo active={active} />
          <img className="lp-desktop-dock" src="/lp/lp6/dock.png" alt="" />
        </div>
      </div>
      <span className="lp-desktop-label" aria-hidden />
    </div>
  );
}
