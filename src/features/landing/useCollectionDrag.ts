import { useEffect, useRef } from "react";

/** One shared offset keeps automatic drift, dragging and momentum continuous. */
export function useCollectionDrag() {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const track = rail?.querySelector<HTMLElement>(".lp-collection-track");
    const group = track?.querySelector<HTMLElement>(".lp-collection-group");
    if (!rail || !track || !group) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = group.getBoundingClientRect().width;
    let offset = 0;
    let velocity = 0;
    let dragLag = 0;
    let wheelVelocity = 0;
    let lastWheelTime = -Infinity;
    let lastMotionTime = 0;
    let pointer: { id: number; x: number; y: number; startX: number; startY: number; time: number } | null = null;
    let grabbedCards: HTMLElement[] = [];
    let hovered = false;
    let mousePosition: { x: number; y: number } | null = null;
    let hoveredCard: HTMLElement | null = null;
    let hoverNeedsUpdate = true;
    const invalidateHover = () => { hoverNeedsUpdate = true; };
    let visible = false;
    let previousTime = 0;
    let frame = 0;

    const setHoveredCard = (card: HTMLElement | null) => {
      if (card === hoveredCard) return;
      hoveredCard?.classList.remove("is-hovered");
      hoveredCard = card;
      hoveredCard?.classList.add("is-hovered");
    };
    const syncHover = () => {
      // Native :hover can still refer to a previous card after a wheel transform.
      // Hit-test the settled strip instead, including when the mouse stays still.
      if (!hovered || !mousePosition || pointer || !visible || document.hidden
        || Math.abs(velocity) > 0.004 || performance.now() - lastWheelTime < 320) {
        setHoveredCard(null);
        hoverNeedsUpdate = true;
        return;
      }
      // Keep this choice until actual input/layout changes. The hover lift itself
      // must not repeatedly move the bottom edge out from under a stationary mouse.
      if (!hoverNeedsUpdate) return;
      hoverNeedsUpdate = false;
      const card = document.elementFromPoint(mousePosition.x, mousePosition.y)
        ?.closest<HTMLElement>(".lp-collection-card");
      setHoveredCard(card && track.contains(card) ? card : null);
    };
    const clearGrab = () => {
      grabbedCards.forEach(card => card.classList.remove("is-grabbed"));
      grabbedCards = [];
    };
    const clearWheel = () => {
      wheelVelocity = 0;
      lastWheelTime = -Infinity;
    };
    const paint = () => {
      if (!width) return;
      offset = ((offset % width) + width) % width;
      // Identical copies let the offset wrap in either direction without a seam.
      const renderedOffset = ((offset - dragLag) % width + width) % width;
      track.style.transform = `translateX(${-renderedOffset}px)`;
      // Wheel events already contain the OS momentum. Use their speed only for tilt.
      const motionVelocity = performance.now() - lastWheelTime < 80 ? wheelVelocity : velocity;
      rail.style.setProperty("--lp-drag-tilt", `${Math.max(-2.2, Math.min(2.2, -motionVelocity * 1.1))}deg`);
      if (pointer && grabbedCards.length) {
        const angle = Math.max(-4, Math.min(4, (pointer.x - pointer.startX) / 55 - velocity * 0.9));
        const lift = -16 + Math.max(-10, Math.min(10, (pointer.y - pointer.startY) * 0.12));
        rail.style.setProperty("--lp-grab-angle", `${angle}deg`);
        rail.style.setProperty("--lp-grab-lift", `${lift}px`);
        // The grabbed card follows the hand; the rest of the strip trails behind.
        rail.style.setProperty("--lp-grab-offset", `${-dragLag}px`);
      }
    };
    const resize = new ResizeObserver(() => {
      width = group.getBoundingClientRect().width;
      invalidateHover();
      paint();
    });
    resize.observe(group);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    intersection.observe(rail);

    const tick = (time: number) => {
      const elapsed = Math.min(time - (previousTime || time), 32);
      previousTime = time;
      if (visible && !document.hidden && !reducedMotion.matches) {
        if (pointer) {
          dragLag *= Math.exp(-elapsed / 45);
          paint();
          frame = requestAnimationFrame(tick);
          return;
        }
        // Keep the moving style through the tilt return (80ms idle + 160ms transition).
        const wheelSettling = time - lastWheelTime < 320;
        if (Math.abs(velocity) > 0.004) {
          // Integrate exponential friction so the long tail feels the same at any frame rate.
          const decay = Math.exp(-elapsed / 520);
          offset += velocity * 520 * (1 - decay);
          velocity *= decay;
        } else if (!wheelSettling && !hovered && !rail.matches(":focus-visible")) {
          offset += (width / 72000) * elapsed;
        }
        rail.classList.toggle("is-coasting", wheelSettling || Math.abs(velocity) > 0.04);
        paint();
      }
      syncHover();
      frame = requestAnimationFrame(tick);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      velocity = 0;
      setHoveredCard(null);
      clearWheel();
      lastMotionTime = event.timeStamp;
      rail.classList.remove("is-coasting");
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, time: event.timeStamp };
      clearGrab();
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(".lp-collection-card") : null;
      if (card?.parentElement) {
        const index = Array.from(card.parentElement.children).indexOf(card);
        // Mark the same card in each loop copy so the held state survives the seam.
        grabbedCards = Array.from(track.querySelectorAll<HTMLElement>(`.lp-collection-group > :nth-child(${index + 1})`));
        grabbedCards.forEach(copy => copy.classList.add("is-grabbed"));
      }
      paint();
      rail.setPointerCapture(event.pointerId);
      rail.classList.add("is-dragging");
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && (mousePosition?.x !== event.clientX || mousePosition?.y !== event.clientY)) {
        mousePosition = { x: event.clientX, y: event.clientY };
        invalidateHover();
      }
      if (pointer?.id !== event.pointerId) return;
      const distance = pointer.x - event.clientX;
      const elapsed = event.timeStamp - pointer.time;
      offset += distance;
      // A small, bounded lag gives the strip weight without losing the pointer.
      dragLag = reducedMotion.matches ? 0 : Math.max(-24, Math.min(24, dragLag + distance));
      if (elapsed > 0 && Math.abs(distance) > 0.25) {
        const sample = Math.max(-3, Math.min(3, distance / elapsed));
        velocity = elapsed > 80 ? sample : velocity * 0.35 + sample * 0.65;
        lastMotionTime = event.timeStamp;
      }
      pointer = { ...pointer, x: event.clientX, y: event.clientY, time: event.timeStamp };
      paint();
    };
    const release = (event: PointerEvent) => {
      if (pointer?.id !== event.pointerId) return;
      // Brief release hesitation should soften a fling, not abruptly erase it.
      // An intentional hold or cancelled touch scroll still stops immediately.
      const idleTime = event.timeStamp - lastMotionTime;
      if (event.type !== "pointerup" || idleTime >= 240 || reducedMotion.matches) velocity = 0;
      else velocity *= Math.exp(-idleTime / 160);
      rail.classList.toggle("is-coasting", Math.abs(velocity) > 0.04);
      // Continue from the rendered position, avoiding a snap when released.
      offset -= dragLag;
      dragLag = 0;
      pointer = null;
      clearGrab();
      rail.classList.remove("is-dragging");
    };
    const enter = (event: PointerEvent) => {
      invalidateHover();
      hovered = event.pointerType === "mouse";
      mousePosition = hovered ? { x: event.clientX, y: event.clientY } : null;
    };
    const leave = () => {
      hovered = false;
      mousePosition = null;
      setHoveredCard(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      velocity = 0;
      clearWheel();
      rail.classList.remove("is-coasting");
      invalidateHover();
      const cardStep = width / group.children.length;
      offset += event.key === "ArrowRight" ? cardStep : -cardStep;
      paint();
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // Preserve trackpad pinch-to-zoom.
      const delta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (!delta || (!event.shiftKey && Math.abs(event.deltaY) > Math.abs(delta))) return;
      event.preventDefault();
      if (pointer) return; // A held card owns the gesture until release.
      setHoveredCard(null);
      mousePosition = { x: event.clientX, y: event.clientY };
      const distance = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1);
      const now = performance.now();
      const elapsed = now - lastWheelTime;
      const sample = Math.max(-3, Math.min(3, distance / (elapsed > 80 ? 16 : Math.max(8, elapsed))));
      wheelVelocity = elapsed > 80 ? sample : wheelVelocity * 0.35 + sample * 0.65;
      lastWheelTime = now;
      velocity = 0;
      rail.classList.toggle("is-coasting", !reducedMotion.matches);
      offset += distance;
      paint();
    };
    window.addEventListener("scroll", invalidateHover, { capture: true, passive: true });
    rail.addEventListener("pointerdown", down);
    rail.addEventListener("pointermove", move);
    rail.addEventListener("pointerup", release);
    rail.addEventListener("pointercancel", release);
    rail.addEventListener("lostpointercapture", release);
    rail.addEventListener("pointerenter", enter);
    rail.addEventListener("pointerleave", leave);
    rail.addEventListener("keydown", key);
    rail.addEventListener("wheel", wheel, { passive: false });
    paint();
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setHoveredCard(null);
      clearGrab();
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener("scroll", invalidateHover, true);
      rail.removeEventListener("pointerdown", down);
      rail.removeEventListener("pointermove", move);
      rail.removeEventListener("pointerup", release);
      rail.removeEventListener("pointercancel", release);
      rail.removeEventListener("lostpointercapture", release);
      rail.removeEventListener("pointerenter", enter);
      rail.removeEventListener("pointerleave", leave);
      rail.removeEventListener("keydown", key);
      rail.removeEventListener("wheel", wheel);
    };
  }, []);

  return railRef;
}
