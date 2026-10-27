import { useEffect, useRef } from "react";

/** Scrub the existing marquee clock so dragging never resets its loop position. */
export function useStoryCardDrag() {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const track = rail?.querySelector<HTMLElement>(".onboarding-card-track");
    const group = track?.querySelector<HTMLElement>(".onboarding-card-group:not([aria-hidden])");
    if (!rail || !track || !group) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let velocity = 0;
    let pointer: { id: number; x: number; time: number; lastMove: number } | null = null;

    const stop = () => {
      cancelAnimationFrame(frame);
      velocity = 0;
      rail.classList.remove("is-coasting");
    };
    const shift = (pixels: number) => {
      const animation = track.getAnimations().find(item =>
        item instanceof CSSAnimation && item.animationName === "onboarding-gallery-drift");
      const timing = animation?.effect?.getTiming();
      const duration = Number(timing?.duration);
      const width = group.getBoundingClientRect().width;
      if (animation && timing && duration > 0 && width > 0) {
        // Input uses viewport pixels; group width includes the story canvas scale.
        const delay = timing.delay ?? 0;
        const phase = Math.max(0, Number(animation.currentTime ?? 0) - delay);
        const next = phase + pixels / width * duration;
        animation.currentTime = delay + ((next % duration) + duration) % duration;
      } else {
        // Reduced Motion keeps one ordinary scrollable group with no auto motion.
        const scale = rail.getBoundingClientRect().width / rail.clientWidth || 1;
        rail.scrollLeft += pixels / scale;
      }
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      stop();
      pointer = { id: event.pointerId, x: event.clientX, time: event.timeStamp, lastMove: event.timeStamp };
      rail.classList.add("is-dragging");
      rail.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (pointer?.id !== event.pointerId) return;
      const distance = pointer.x - event.clientX;
      const elapsed = event.timeStamp - pointer.time;
      shift(distance);
      if (elapsed > 0 && Math.abs(distance) > 0.25) {
        // Match the LP's velocity sampling and release feel.
        const sample = Math.max(-3, Math.min(3, distance / elapsed));
        velocity = elapsed > 80 ? sample : velocity * 0.35 + sample * 0.65;
        pointer.lastMove = event.timeStamp;
      }
      pointer.x = event.clientX;
      pointer.time = event.timeStamp;
    };
    const release = (event: PointerEvent) => {
      if (pointer?.id !== event.pointerId) return;
      const idle = event.timeStamp - pointer.lastMove;
      if (event.type !== "pointerup" || idle >= 240 || reduced.matches) velocity = 0;
      else velocity *= Math.exp(-idle / 160);
      pointer = null;
      rail.classList.remove("is-dragging");
      if (Math.abs(velocity) <= 0.004) return;
      rail.classList.add("is-coasting");
      let previous = performance.now();
      const coast = (now: number) => {
        if (reduced.matches || document.hidden) { stop(); return; }
        const elapsed = Math.min(now - previous, 32);
        previous = now;
        const decay = Math.exp(-elapsed / 520);
        shift(velocity * 520 * (1 - decay));
        velocity *= decay;
        if (Math.abs(velocity) > 0.004) frame = requestAnimationFrame(coast);
        else stop();
      };
      frame = requestAnimationFrame(coast);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      stop();
      const step = group.getBoundingClientRect().width / group.children.length;
      shift(event.key === "ArrowRight" ? step : -step);
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const delta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (!delta || (!event.shiftKey && Math.abs(event.deltaY) > Math.abs(delta))) return;
      event.preventDefault();
      if (pointer) return;
      stop();
      shift(delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.getBoundingClientRect().width : 1));
    };
    const preventNativeDrag = (event: DragEvent) => event.preventDefault();
    rail.addEventListener("pointerdown", down);
    rail.addEventListener("pointermove", move);
    rail.addEventListener("pointerup", release);
    rail.addEventListener("pointercancel", release);
    rail.addEventListener("lostpointercapture", release);
    rail.addEventListener("keydown", key);
    rail.addEventListener("wheel", wheel, { passive: false });
    rail.addEventListener("dragstart", preventNativeDrag);
    reduced.addEventListener("change", stop);
    return () => {
      stop();
      rail.classList.remove("is-dragging");
      rail.removeEventListener("pointerdown", down);
      rail.removeEventListener("pointermove", move);
      rail.removeEventListener("pointerup", release);
      rail.removeEventListener("pointercancel", release);
      rail.removeEventListener("lostpointercapture", release);
      rail.removeEventListener("keydown", key);
      rail.removeEventListener("wheel", wheel);
      rail.removeEventListener("dragstart", preventNativeDrag);
      reduced.removeEventListener("change", stop);
    };
  }, []);

  return railRef;
}
