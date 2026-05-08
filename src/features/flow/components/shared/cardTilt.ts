import type { MouseEvent } from "react";

function applyCardTilt(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  intensityDeg: number,
  lift: string,
) {
  const rect = el.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const x = (clientX - rect.left) / width;
  const y = (clientY - rect.top) / height;

  el.style.setProperty("--tilt-x", `${(0.5 - y) * intensityDeg}deg`);
  el.style.setProperty("--tilt-y", `${(x - 0.5) * intensityDeg}deg`);
  el.style.setProperty("--tilt-lift", lift);
  el.style.setProperty("--tilt-shine-x", `${x * 100}%`);
  el.style.setProperty("--tilt-shine-y", `${y * 100}%`);
}

function resetCardTilt(el: HTMLElement) {
  el.style.setProperty("--tilt-x", "0deg");
  el.style.setProperty("--tilt-y", "0deg");
  el.style.setProperty("--tilt-lift", "0px");
}

export function onCardSlotMouseMove(e: MouseEvent<HTMLDivElement>) {
  applyCardTilt(e.currentTarget, e.clientX, e.clientY, 14, "-10px");
}

export function onCardSlotMouseLeave(e: MouseEvent<HTMLDivElement>) {
  resetCardTilt(e.currentTarget);
}

export function onResultCardMouseMove(e: MouseEvent<HTMLElement>) {
  applyCardTilt(e.currentTarget, e.clientX, e.clientY, 5.5, "-4px");
}

export function onResultCardMouseLeave(e: MouseEvent<HTMLElement>) {
  resetCardTilt(e.currentTarget);
}
