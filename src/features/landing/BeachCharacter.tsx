import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";

const MAX_STRETCH = 0.2;
const MAX_LIFT_PERCENT = 16;

type Props = { image: string; name: string; flip?: boolean; style: CSSProperties };

export function BeachCharacter({ image, name, flip, style }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; y: number; height: number; start: number } | null>(null);
  const tension = useRef(0);
  const rebound = useRef<Animation | null>(null);

  const shape = (amount: number) =>
    `translateY(${-amount * MAX_LIFT_PERCENT}%) scale(${1 - amount * 0.08}, ${1 + amount * MAX_STRETCH})`;
  const updateTaut = (button: HTMLButtonElement, amount: number) => {
    // Hysteresis prevents flickering at the edge of the taut state.
    button.classList.toggle("is-taut", amount >= (button.classList.contains("is-taut") ? 0.82 : 0.9));
  };
  const cancelRebound = () => {
    rebound.current?.cancel();
    rebound.current = null;
  };
  const settle = () => {
    const button = ref.current;
    if (!button) return;
    const start = tension.current;
    cancelRebound();
    button.classList.remove("is-pulling", "is-taut");
    button.classList.add("is-returning");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A damped spring crosses the rest position twice, then settles exactly.
    const frames = reduced ? [{ transform: shape(start) }, { transform: shape(0) }]
      : Array.from({ length: 49 }, (_, index) => {
        const t = index / 48;
        const amount = index === 48 ? 0 : start * Math.exp(-7 * t) * (Math.cos(12 * t) + (7 / 12) * Math.sin(12 * t));
        return { transform: shape(amount), offset: t };
      });
    const animation = button.animate(frames, { duration: reduced ? 120 : 720, easing: "linear" });
    rebound.current = animation;
    button.style.transform = shape(0);
    animation.onfinish = () => {
      tension.current = 0;
      rebound.current = null;
      button.classList.remove("is-returning");
    };
  };
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const button = event.currentTarget;
    // Re-grabbing a returning character starts at its currently rendered shape.
    const scaleY = new DOMMatrix(getComputedStyle(button).transform).d;
    const amount = Math.max(-0.2, Math.min(0.999, (scaleY - 1) / MAX_STRETCH));
    cancelRebound();
    tension.current = amount;
    button.style.transform = shape(amount);
    button.classList.remove("is-returning");
    button.classList.add("is-pulling");
    updateTaut(button, amount);
    drag.current = { id: event.pointerId, y: event.clientY, height: button.offsetHeight, start: amount };
    button.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const limit = active.height * 0.55;
    // Inverse of the resistance curve preserves continuity when re-grabbed.
    const initialDistance = -Math.log(1 - active.start) * limit;
    const distance = Math.max(Math.min(0, initialDistance), initialDistance + active.y - event.clientY);
    tension.current = 1 - Math.exp(-distance / limit);
    event.currentTarget.style.transform = shape(tension.current);
    updateTaut(event.currentTarget, tension.current);
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    settle();
  };
  useEffect(() => () => { rebound.current?.cancel(); }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="lp-beach-character"
      style={style}
      aria-label={`${name}を上に引っぱる`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onClick={(event) => {
        // Keyboard and assistive-technology activation get the same playful response.
        if (event.detail !== 0) return;
        cancelRebound();
        tension.current = 0.7;
        settle();
      }}
    >
      <img src={`/lp/bed-${image}.png`} alt="" draggable={false} style={{ transform: flip ? "scaleX(-1)" : undefined }} />
    </button>
  );
}
