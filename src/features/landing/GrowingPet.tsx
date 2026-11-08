import { useEffect, useRef, useState } from 'react';
import { LandingPet, landingPetGeometry } from './LandingPet';
import { useReplayScene } from './useReplayScene';

export function GrowingPet() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useReplayScene(host, .85);
  const elapsed = useRef(0);
  const [growth, setGrowth] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => element.style.setProperty('--growth-scale', String(entry.contentRect.width / 397)));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (!scene.entered) { elapsed.current = 0; setGrowth(0); return; }
    if (!scene.playing) return;
    let previous = performance.now();
    const tick = () => {
      const now = performance.now();
      elapsed.current = Math.min(5000, elapsed.current + now - previous); previous = now;
      setGrowth(elapsed.current / 5000);
      if (elapsed.current >= 5000) clearInterval(timer);
    };
    const timer = window.setInterval(tick, 50);
    return () => clearInterval(timer);
  }, [scene.entered, scene.playing]);
  const pose = 'bad';
  // Figma's final 85.2514px body stroke and unchanged 178×65 timer at (123,428).
  const finalGrowth = (85.2514 - 34.5135) / (130.754 - 34.5135);
  const finalHeight = 300 + finalGrowth * 517;
  const geometry = landingPetGeometry(pose, (scene.reduced ? 1 : growth) * finalGrowth, finalHeight);
  return <div ref={host} className="lp-example-pet-art lp-growing-pet" data-growth={!scene.entered ? 'waiting' : growth >= 1 || scene.reduced ? 'complete' : scene.playing ? 'growing' : 'paused'} aria-hidden="true">
    <LandingPet pose={pose} geometry={geometry} playing={scene.playing} reduced={scene.reduced} />
  </div>;
}
