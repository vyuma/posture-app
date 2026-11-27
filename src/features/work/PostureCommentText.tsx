import { useLayoutEffect, useRef } from 'react';

export function PostureCommentText({ children }: { children: string }) {
  const paragraph = useRef<HTMLParagraphElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = paragraph.current, content = text.current;
    if (!container || !content) return;
    let disposed = false;
    const fit = () => {
      if (disposed || !container.clientWidth) return;
      const base = parseFloat(getComputedStyle(container).fontSize);
      content.style.fontSize = `${base}px`;
      content.style.letterSpacing = '0em';
      // Inline fragments count actual lines, even inside a scaled or tilted card.
      const fits = () => content.getClientRects().length <= 2;
      if (fits()) return;
      content.style.letterSpacing = '-0.1em';
      for (let size = base - .25; size >= 1 && !fits(); size -= .25) {
        content.style.fontSize = `${size}px`;
      }
    };
    fit();
    let lastWidth = -1;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width === lastWidth) return;
      lastWidth = width; fit();
    });
    observer.observe(container);
    window.addEventListener('resize', fit);
    document.fonts?.addEventListener('loadingdone', fit);
    void document.fonts?.ready.then(fit);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', fit);
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  }, [children]);
  return <p ref={paragraph}><span ref={text}>{children}</span></p>;
}
