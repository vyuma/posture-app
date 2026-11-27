import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clampWidgetPosition, type Point, type WidgetBounds } from './widgetPosition';

/** A click opens the app; movement beyond 4px starts a web or OS window drag. */
export function useWidgetDrag(enabled: boolean, bounds: WidgetBounds, onActivate: () => void, onNativeDrag?: () => void) {
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }));
  const [requested, setRequested] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; target: HTMLDivElement; origin: Point; pointer: Point; offset: Point; moved: boolean } | null>(null);
  const position = clampWidgetPosition(requested ?? { x: viewport.width - 238, y: viewport.height - 89 }, viewport, bounds);
  // Commit an edge correction, so a shrinking pet does not jump back to an old
  // requested position while its unchanged pose transition is still playing.
  useLayoutEffect(() => {
    if (enabled && requested && (requested.x !== position.x || requested.y !== position.y)) setRequested(position);
  }, [enabled, requested, position.x, position.y]);
  const finish = () => {
    const active = drag.current;
    drag.current = null; setDragging(false);
    if (active?.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
  };
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    const blur = () => finish();
    window.addEventListener('resize', resize); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('blur', blur); };
  }, [enabled]);
  const move = (next: Point) => setRequested(clampWidgetPosition(next, viewport, bounds));
  return {
    style: enabled ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined,
    dragging,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !event.isPrimary || drag.current) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, target: event.currentTarget, origin: position,
          pointer: { x: event.clientX, y: event.clientY }, offset: position, moved: false };
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const active = drag.current;
        if (!active || active.id !== event.pointerId) return;
        if (!active.moved && Math.hypot(event.clientX - active.pointer.x, event.clientY - active.pointer.y) < 4) return;
        active.moved = true;
        if (!enabled) { finish(); onNativeDrag?.(); return; }
        setDragging(true);
        move({ x: active.offset.x + event.clientX - active.pointer.x, y: active.offset.y + event.clientY - active.pointer.y });
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const active = drag.current;
        if (!active || active.id !== event.pointerId) return;
        const clicked = !active.moved && Math.hypot(event.clientX - active.pointer.x, event.clientY - active.pointer.y) < 4;
        finish();
        if (clicked) onActivate();
      },
      onPointerCancel(event: PointerEvent<HTMLDivElement>) {
        if (drag.current?.id !== event.pointerId) return;
        if (enabled) move(drag.current.origin); finish();
      },
      onLostPointerCapture() { finish(); },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) onActivate(); return; }
        if (!enabled) return;
        if (event.key === 'Escape' && drag.current) { event.preventDefault(); move(drag.current.origin); finish(); return; }
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta) return;
        event.preventDefault(); const step = event.shiftKey ? 40 : 10;
        move({ x: position.x + delta[0] * step, y: position.y + delta[1] * step });
      },
    },
  };
}
