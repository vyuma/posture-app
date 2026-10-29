import { useLayoutEffect, useRef } from 'react';
import { UI_UPDATE_INTERVAL_MS } from '../posture/constants';

const CIRCUMFERENCE = 2 * Math.PI * 150;

/** Interpolate only confirmed progress; never run ahead of the registration clock. */
export function CalibrationProgress({ remaining, duration, complete }: { remaining: number; duration: number; complete: boolean }) {
  const circle = useRef<SVGCircleElement>(null);
  const displayed = useRef(0);
  const previousRemaining = useRef(remaining);
  useLayoutEffect(() => {
    const element = circle.current;
    if (!element) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const target = complete ? 0 : -CIRCUMFERENCE * (1 - remaining / duration);
    const reset = remaining > previousRemaining.current;
    previousRemaining.current = remaining;
    let frame = 0;
    const paint = (value: number) => {
      displayed.current = value;
      element.style.strokeDashoffset = String(value);
    };
    const finish = () => { cancelAnimationFrame(frame); paint(target); };
    if (complete || reset || reduced.matches) finish();
    else {
      const from = displayed.current, started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - started) / UI_UPDATE_INTERVAL_MS));
        paint(from + (target - from) * progress);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    reduced.addEventListener('change', finish);
    return () => { cancelAnimationFrame(frame); reduced.removeEventListener('change', finish); };
  }, [remaining, duration, complete]);
  return <circle ref={circle} className="work-calibration-progress" cx="160" cy="160" r="150" strokeDasharray={CIRCUMFERENCE} />;
}
