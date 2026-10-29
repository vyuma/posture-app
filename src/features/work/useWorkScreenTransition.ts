import { useLayoutEffect, useRef } from 'react';

const measurementViews = new Set(['prepare', 'calibrate', 'ready', 'active', 'rest', 'pause']);
const route = (view: string | null) => view && (measurementViews.has(view) ? 'measurement' : view);

/** Fade only page content. Keep the logo, camera and existing character rigs stable. */
export function useWorkScreenTransition(view: string | null) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(route(view));
  const current = route(view);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = current;
    if (!from || from === current || !root.current) return;
    root.current.scrollTo({ top: 0, behavior: 'instant' });
    // Home/story already retain the outgoing scene and perform their own transition.
    if ([from, current].every(value => value === 'home' || value === 'story')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const content = root.current.querySelectorAll<HTMLElement>([
      '.work-home-hero > :not(.work-brand)', '.work-collection',
      '.work-picker-preview', '.work-picker-list', '.work-timer-panel',
      '.work-registration-panel', '.work-measuring-panel',
      '.work-result-heading', '.work-result-screen > .work-result', '.work-result-navigation',
      '.timelapse-panel', '.timelapse-file-actions',
    ].join(','));
    const animations = Array.from(content).filter(element => element.getClientRects().length > 0)
      .map(element => element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 240, easing: 'cubic-bezier(.22,1,.36,1)',
      }));
    return () => animations.forEach(animation => animation.cancel());
  }, [current]);
  return root;
}
