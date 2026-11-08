import { useEffect, type RefObject } from "react";

/** Keep content visible; replay concerns when the thought scene leaves view. */
export function useLandingMotion(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const page = ref.current;
    if (!page) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    const revealedBefore = new WeakSet<Element>();
    const concerns = Array.from(page.querySelectorAll<HTMLElement>(".lp6-concern"));
    const beaches = Array.from(page.querySelectorAll<HTMLElement>(".lp-character-bed"));
    const visibleBeaches = new Set<Element>();
    const sync = () => {
      beaches.forEach(beach => beach.classList.toggle("is-motion-visible",
        visibleBeaches.has(beach) && !document.hidden && !reduced.matches));
      if (reduced.matches) animations.forEach(animation => animation.cancel());
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (element.classList.contains("lp-character-bed")) {
          if (entry.isIntersecting) visibleBeaches.add(element);
          else visibleBeaches.delete(element);
        } else if (entry.isIntersecting && entry.intersectionRatio >= 0.12 && !seen.has(element)) {
          seen.add(element);
          const repeatable = element.classList.contains("lp6-concern");
          const replay = repeatable && revealedBefore.has(element);
          revealedBefore.add(element);
          if (!repeatable) observer.unobserve(element);
          if (!reduced.matches && !document.hidden) {
            const delay = element.classList.contains("lp6-concern--2") ? 120
              : element.classList.contains("lp6-concern--3") ? 240 : 0;
            // Individual translate preserves Figma centering transforms.
            const animation = element.animate([
              { opacity: 0, translate: "0 10px" },
              { opacity: 1, translate: "0 0" },
            ], { duration: replay ? 420 : 600, delay, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
            animations.add(animation);
            animation.onfinish = animation.oncancel = () => animations.delete(animation);
          }
        }
      }
      sync();
    }, { threshold: 0.12 });
    page.querySelectorAll(".lp-character-bed, .lp-hero-brand, .lp6-concern, .lp6-concept-copy, .lp6-point-heading, .lp-how-step, .lp-final-cta h2")
      .forEach(element => observer.observe(element));
    // Re-arm as soon as the thoughts leave view, even if the heading is still visible.
    // Keep a single scene boundary so individual bubbles do not flicker on small scrolls.
    const replayObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => !entry.isIntersecting)) {
        concerns.forEach(concern => seen.delete(concern));
      }
    });
    const concernGroup = page.querySelector(".lp6-concern-scene");
    if (concernGroup) replayObserver.observe(concernGroup);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      replayObserver.disconnect();
      animations.forEach(animation => animation.cancel());
      beaches.forEach(beach => beach.classList.remove("is-motion-visible"));
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ref]);
}
