import { useEffect, useState, type RefObject } from 'react';

/** Start on the artwork, re-arm only after its entire fixed footprint leaves view. */
export function useReplayScene(ref: RefObject<HTMLElement | null>, fraction = .75) {
  const [scene, setScene] = useState({ entered: false, playing: false, reduced: false });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false, ready = false, entered = false;
    let delay: number | undefined;
    const publish = () => {
      const next = { entered, playing: entered && visible && !document.hidden && !reduced.matches, reduced: reduced.matches };
      setScene(previous => previous.entered === next.entered && previous.playing === next.playing && previous.reduced === next.reduced ? previous : next);
    };
    const update = () => {
      clearTimeout(delay);
      if (!visible) entered = false;
      publish();
      if (!entered && ready && !document.hidden) {
        delay = window.setTimeout(() => { entered = true; publish(); }, 300);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRect.height > 0;
      const available = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height ?? innerHeight);
      ready = visible && entry.intersectionRect.height >= available * fraction;
      update();
    }, { threshold: Array.from({ length: 101 }, (_, i) => i / 100) });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', update);
    return () => { clearTimeout(delay); observer.disconnect(); document.removeEventListener('visibilitychange', update); reduced.removeEventListener('change', update); };
  }, [ref, fraction]);
  return scene;
}
