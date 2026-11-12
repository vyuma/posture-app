import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { speechDuration, type SpeechEvent } from '../posture/feedbackSpeech';
import { widgetBounds, type Point } from '../work/widgetPosition';
import { LandingPet, landingPetGeometry } from './LandingPet';
import { clampDesktopPet, DESKTOP_PET_SCALE, DESKTOP_SURFACE } from './desktopPetPosition';

/** A scripted illustration only: shares the live pet's rig, geometry and speech. */
export function LandingPetDemo({ active }: { active: boolean }) {
  const [frame, setFrame] = useState({ bad: false, growth: 0, speech: null as SpeechEvent | null });
  const [requested, setRequested] = useState<Point>({ x: 375, y: 238.58 });
  const [dragging, setDragging] = useState(false);
  const [pointerFocus, setPointerFocus] = useState(false);
  const drag = useRef<{ id: number; target: HTMLButtonElement; pointer: Point; origin: Point; scale: number } | null>(null);
  useEffect(() => {
    if (!active) { setFrame({ bad: false, growth: 0, speech: null }); return; }
    const start = Date.now();
    let previousPhase = '';
    let speech: SpeechEvent | null = null;
    const update = () => {
      const now = Date.now(), elapsed = now - start, time = elapsed % 17500;
      const bad = time >= 10500;
      const phase = `${Math.floor(elapsed / 17500)}:${bad}`;
      if (phase !== previousPhase) {
        previousPhase = phase;
        speech = { id: phase, code: bad ? 'general' : 'good', text: bad ? '姿勢を戻して！' : 'いい感じ！', ...(bad ? { whileBad: true as const } : {}), startedAt: now, endsAt: now + speechDuration(bad ? 'general' : 'good') };
      }
      const growth = bad ? Math.min(1, (time - 10500) / 5000) : 0;
      setFrame(previous => previous.bad === bad && previous.growth === growth && previous.speech === speech ? previous : { bad, growth, speech });
    };
    update();
    const timer = window.setInterval(update, 50);
    return () => window.clearInterval(timer);
  }, [active]);
  const pose = frame.bad ? 'bad' : 'good';
  const geometry = landingPetGeometry(pose, frame.growth, 470, frame.speech);
  const bounds = widgetBounds(pose, geometry);
  const position = clampDesktopPet(requested, bounds);
  useLayoutEffect(() => {
    if (position.x !== requested.x || position.y !== requested.y) setRequested(position);
  }, [position.x, position.y, requested]);
  const move = (point: Point) => setRequested(clampDesktopPet(point, bounds));
  const finish = () => {
    const current = drag.current; drag.current = null; setDragging(false);
    if (current?.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
  };
  useEffect(() => {
    window.addEventListener('blur', finish);
    return () => window.removeEventListener('blur', finish);
  }, []);
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    const surface = event.currentTarget.closest('.lp-desktop-surface');
    if (!surface) return;
    setPointerFocus(true);
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, target: event.currentTarget, pointer: { x: event.clientX, y: event.clientY }, origin: position, scale: surface.getBoundingClientRect().width / DESKTOP_SURFACE.width };
    setDragging(true);
  }
  return <div className={`lp-desktop-motion${dragging ? ' is-dragging' : ''}`} style={{ left: position.x, top: position.y }}>
    <LandingPet pose={pose} geometry={geometry} speech={active ? frame.speech : null} playing={active} />
    <button className="lp-desktop-drag-handle" type="button" data-pointer-focus={pointerFocus} onBlur={() => setPointerFocus(false)} aria-label="ピンアナゴを移動。ドラッグまたは矢印キー、Shiftで大きく移動"
      style={{ left: bounds.left * DESKTOP_PET_SCALE, top: bounds.top * DESKTOP_PET_SCALE, width: (bounds.right - bounds.left) * DESKTOP_PET_SCALE, height: (bounds.bottom - bounds.top) * DESKTOP_PET_SCALE }}
      onPointerDown={start} onPointerMove={event => { const d = drag.current; if (d?.id === event.pointerId) move({ x: d.origin.x + (event.clientX - d.pointer.x) / d.scale, y: d.origin.y + (event.clientY - d.pointer.y) / d.scale }); }}
      onPointerUp={finish} onPointerCancel={() => { if (drag.current) move(drag.current.origin); finish(); }} onLostPointerCapture={finish}
      onKeyDown={event => {
        setPointerFocus(false);
        if (event.key === 'Escape' && drag.current) { move(drag.current.origin); finish(); return; }
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta) return;
        event.preventDefault(); const step = event.shiftKey ? 24 : 6;
        move({ x: position.x + delta[0] * step, y: position.y + delta[1] * step });
      }} />
  </div>;
}
