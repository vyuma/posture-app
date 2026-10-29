import { useLayoutEffect, useRef } from 'react';

/** Keep Figma's proportional figures; fit only when a time exceeds its control slot. */
export function WidgetTimerText({ time }: { time: string }) {
  const text = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = text.current, slot = element?.parentElement;
    if (!element || !slot) return;
    const fit = () => {
      // Computed width is untransformed, including inside the scaled LP mockup.
      const width = parseFloat(getComputedStyle(element).width);
      element.style.setProperty('--widget-time-scale', String(width > 0 ? Math.min(1, slot.clientWidth / width) : 1));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element); observer.observe(slot);
    return () => observer.disconnect();
  }, [time]);
  return <b ref={text}>{time}</b>;
}
