import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** Keep empty parts of the stable Windows canvas out of other apps' mouse input. */
export function useWindowsWidgetRegion(active: boolean) {
  useEffect(() => {
    if (!active || !/\bWindows\b/i.test(navigator.userAgent)) return;
    let cancelled = false;
    let timer: number | undefined;
    let previous = '';
    async function update() {
      if (cancelled) return;
      const regions = [
        ['.work-widget-character-shadow', 80],
        ['.work-widget-speech-frame, .work-widget-speech', 16],
        ['.work-widget-bar', 12],
        ['.work-overlay-error', 4],
      ] as const;
      const rects = regions.flatMap(([selector, padding]) => {
        const element = document.querySelector(selector);
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        return [[rect.left - padding, rect.top - padding, rect.right + padding, rect.bottom + padding]
          .map(value => Math.round(value / 2) * 2)];
      });
      const key = JSON.stringify([devicePixelRatio, innerWidth, innerHeight, rects]);
      if (key !== previous) {
        try {
          await invoke('work_widget_set_regions', { rects });
          previous = key;
        } catch (error) {
          // Leave the last valid region intact; never replace it with a full canvas.
          console.warn('Failed to update widget input region', error);
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void update(), 32);
    }
    void update();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [active]);
}
