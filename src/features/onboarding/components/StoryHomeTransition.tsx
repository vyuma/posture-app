import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type View = 'home' | 'story';

/** Retain the outgoing page briefly without mounting two stories or two homes. */
export function StoryHomeTransition({ view, children }: { view: View; children: (view: View) => ReactNode }) {
  const [shown, setShown] = useState(view);
  const [entering, setEntering] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const exiting = shown !== view;

  useLayoutEffect(() => {
    if (!exiting) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const commit = () => {
      root.current?.closest('.work-app')?.scrollTo({ top: 0, behavior: 'instant' });
      focusPending.current = true;
      setShown(view);
      setEntering(!reduced);
    };
    if (reduced) { commit(); return; }
    const timer = setTimeout(commit, 180);
    return () => clearTimeout(timer);
  }, [view, exiting]);

  useEffect(() => {
    if (!entering) return;
    const timer = setTimeout(() => setEntering(false), 320);
    return () => clearTimeout(timer);
  }, [entering]);

  useEffect(() => {
    if (exiting || entering || !focusPending.current) return;
    focusPending.current = false;
    root.current?.querySelector<HTMLButtonElement>(shown === 'story' ? '.onboarding-start' : '.work-about')?.focus({ preventScroll: true });
  }, [exiting, entering, shown]);

  return <div ref={root} className="story-home-transition" data-phase={exiting ? 'exit' : entering ? 'enter' : 'idle'} aria-busy={exiting || entering} inert={exiting || entering}>
    <div className="story-home-transition-content">{children(shown)}</div>
  </div>;
}
