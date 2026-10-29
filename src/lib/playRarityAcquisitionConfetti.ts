import confetti from 'canvas-confetti';
import { rarityEffects, type RarityEffect } from '../features/characters/rarityEffects';

/** Each reveal owns its canvas and timer; closing it never leaks a later burst. */
export function playRarityAcquisitionConfetti(effect: RarityEffect): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return () => {};
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '10000' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const fire = confetti.create(canvas, { resize: true, useWorker: false });
  const preset = rarityEffects[effect];
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; clearTimeout(timer); clearTimeout(end); fire.reset(); canvas.remove(); document.removeEventListener('visibilitychange', onVisibility); };
  const onVisibility = () => { if (document.hidden) dispose(); };
  const timer = window.setTimeout(() => {
    const common = { colors: preset.colors, disableForReducedMotion: true, ticks: 90, gravity: .75, decay: .92, scalar: effect === 'miira' ? .45 : .75 };
    if (effect === 'king') {
      void fire({ ...common, particleCount: 45, angle: 65, spread: 54, startVelocity: 30, origin: { x: .16, y: .72 } });
      void fire({ ...common, particleCount: 45, angle: 115, spread: 54, startVelocity: 30, origin: { x: .84, y: .72 } });
    } else {
      void fire({ ...common, particleCount: effect === 'sakura' ? 22 : 16, shapes: ['circle'], spread: 65, startVelocity: 15, origin: { x: .32, y: .44 } });
    }
  }, preset.confettiDelayMs);
  const end = window.setTimeout(dispose, preset.confettiDelayMs + 2200);
  document.addEventListener('visibilitychange', onVisibility);
  return dispose;
}
