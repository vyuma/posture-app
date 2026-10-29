import { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import { WIDGET_STILL, WIDGET_TRANSITIONS, type WidgetPose } from './widgetPresentation';

/** Finish an in-flight morph before accepting the newest state; no mid-pose jumps. */
export function WidgetPetRig({ pose }: { pose: WidgetPose }) {
  const container = useRef<HTMLDivElement>(null);
  const desired = useRef(pose); desired.current = pose;
  const drive = useRef<() => void>(() => {});
  useEffect(() => {
    if (!container.current) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const player = lottie.loadAnimation({ container: container.current, renderer: 'svg', loop: false, autoplay: false,
      path: '/animations/anago/normal-nago/widget-states-v2.json', rendererSettings: { preserveAspectRatio: 'xMidYMax meet' } });
    let ready = false, moving = false, current = desired.current;
    const settle = () => { player.resetSegments(true); player.goToAndStop(WIDGET_STILL[current], true); container.current?.setAttribute('data-settled-pose', current); };
    const advance = () => {
      if (!ready) return;
      if (reduced.matches) { moving = false; current = desired.current; settle(); return; }
      if (moving || current === desired.current) return;
      const next = desired.current, segment = WIDGET_TRANSITIONS[`${current}:${next}`];
      current = next;
      if (!segment) { settle(); return; }
      moving = true; player.playSegments([segment[0], segment[1] + 1], true);
    };
    const loaded = () => { ready = true; current = desired.current; settle(); };
    const complete = () => { moving = false; settle(); advance(); };
    drive.current = advance;
    player.addEventListener('DOMLoaded', loaded); player.addEventListener('complete', complete); reduced.addEventListener('change', advance);
    return () => { drive.current = () => {}; reduced.removeEventListener('change', advance); player.destroy(); };
  }, []);
  useEffect(() => { drive.current(); }, [pose]);
  return <div className="work-widget-rig" ref={container} role="img" aria-label={pose === 'bad' ? '怒っているシマアナゴ' : pose === 'rest' ? '休憩中のシマアナゴ' : pose === 'paused' ? '目を閉じたシマアナゴ' : 'シマアナゴ'} />;
}
