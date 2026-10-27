import { useEffect, useRef } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
type Pose = 'good' | 'bad' | 'paused';
const still = { good: 0, bad: 1, paused: 2 };
const transitions: Record<string, [number, number]> = { 'good:bad': [183, 212], 'bad:good': [213, 287], 'good:paused': [288, 317], 'paused:good': [318, 347], 'bad:paused': [348, 377], 'paused:bad': [378, 407] };
export function PetRig({ pose }: { pose: Pose }) {
  const container = useRef<HTMLDivElement>(null); const animation = useRef<AnimationItem | null>(null); const previous = useRef<Pose>('good'); const desired = useRef(pose); desired.current = pose;
  useEffect(() => {
    if (!container.current) return;
    const player = lottie.loadAnimation({ container: container.current, renderer: 'svg', loop: false, autoplay: false, path: '/animations/anago/normal-nago/expression-states.json', rendererSettings: { preserveAspectRatio: 'xMidYMax meet' } });
    animation.current = player;
    const ready = () => { player.goToAndStop(still[desired.current], true); previous.current = desired.current; };
    player.addEventListener('DOMLoaded', ready); return () => { player.destroy(); animation.current = null; };
  }, []);
  useEffect(() => { const player = animation.current; if (!player || previous.current === pose) return; const transition = transitions[`${previous.current}:${pose}`]; previous.current = pose; if (matchMedia('(prefers-reduced-motion: reduce)').matches || !transition) player.goToAndStop(still[pose], true); else { player.playSegments(transition, true); } }, [pose]);
  return <div className="work-pet-rig" ref={container} role="img" aria-label={pose === 'bad' ? '姿勢を戻そう！' : pose === 'paused' ? '休憩中のシマアナゴ' : 'シマアナゴ'} />;
}
