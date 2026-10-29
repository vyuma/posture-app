import { useLayoutEffect, useRef } from 'react';

/** Prefer one line without making long descriptions unreadably small. */
export function CardStory({ children }: { children: string }) {
  const paragraph = useRef<HTMLParagraphElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = paragraph.current, content = text.current;
    if (!container || !content) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      const style = getComputedStyle(container);
      const width = parseFloat(style.width), base = parseFloat(style.fontSize);
      if (!width || !base) return;
      const apply = (size: number, tracking: number) => {
        content.style.fontSize = `${size}px`;
        content.style.letterSpacing = `${tracking}em`;
      };
      content.style.display = 'inline-block'; content.style.whiteSpace = 'nowrap';
      const fits = () => parseFloat(getComputedStyle(content).width) <= width + .1;
      apply(base, 0);
      if (fits()) return;
      apply(base, -.04);
      if (fits()) {
        let low = -.04, high = 0;
        for (let i = 0; i < 8; i++) {
          const mid = (low + high) / 2; apply(base, mid);
          if (fits()) low = mid; else high = mid;
        }
        apply(base, low); return;
      }
      const minimum = Math.min(base, Math.max(12, base * .85));
      apply(minimum, -.04);
      if (fits()) {
        let low = minimum, high = base;
        for (let i = 0; i < 8; i++) {
          const mid = (low + high) / 2; apply(mid, -.04);
          if (fits()) low = mid; else high = mid;
        }
        apply(low, -.04); return;
      }
      content.style.display = 'inline'; content.style.whiteSpace = 'normal';
    };
    fit();
    let lastWidth = -1;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width === lastWidth) return;
      lastWidth = width; fit();
    });
    observer.observe(container);
    // A breakpoint can change the base font even if this paragraph's width stays equal.
    window.addEventListener('resize', fit);
    document.fonts.addEventListener('loadingdone', fit);
    void document.fonts.ready.then(fit);
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', fit); document.fonts.removeEventListener('loadingdone', fit); };
  }, [children]);
  return <p ref={paragraph}><span ref={text}>{children}</span></p>;
}
