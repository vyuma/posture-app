import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web/build/player/lottie_light";

type Pose = "intro" | "happy" | "angry";
const frameFor = (pose: Pose) => ({ intro: 0, happy: 30, angry: 61 })[pose];

/** Keep one pet rig mounted: a pose change bends the body instead of fading images. */
export function StoryAnago({ pose }: { pose: Pose }) {
  const container = useRef<HTMLDivElement>(null);
  const requested = useRef(pose);
  const drive = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  requested.current = pose;

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let loaded = false;
    let playing = false;
    let settled: Pose = requested.current;
    let destination: Pose = settled;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const host = container.current;
    let animation: AnimationItem | null = null;
    drive.current = () => {
      if (!loaded || disposed || !animation) return;
      if (reduced.matches) {
        playing = false;
        settled = destination = requested.current;
        animation.resetSegments(true);
        animation.goToAndStop(frameFor(settled), true);
      } else if (!playing && requested.current !== settled) {
        destination = settled === "happy" ? requested.current : "happy";
        playing = true;
        const range: [number, number] = settled === "intro" ? [0, 31]
          : settled === "angry" ? [62, 31]
          : destination === "intro" ? [31, 0] : [31, 62];
        animation.playSegments(range, true);
      }
    };
    const complete = () => {
      playing = false;
      settled = destination;
      animation?.resetSegments(true);
      animation?.goToAndStop(frameFor(settled), true);
      drive.current();
    };
    const load = () => {
      if (disposed) return;
      loaded = true;
      animation?.resetSegments(true);
      animation?.goToAndStop(frameFor(settled), true);
      setReady(true);
      drive.current();
    };
    const preferenceChanged = () => drive.current();
    void import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (disposed) return;
      animation = lottie.loadAnimation({
        container: host, renderer: "svg", loop: false, autoplay: false,
        path: "/story/redesign/story-poses.json",
        rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false },
      });
      animation.addEventListener("DOMLoaded", load);
      animation.addEventListener("complete", complete);
    }).catch(() => { /* The supplied static art remains visible if loading fails. */ });
    reduced.addEventListener("change", preferenceChanged);
    return () => {
      disposed = true;
      drive.current = () => {};
      reduced.removeEventListener("change", preferenceChanged);
      animation?.destroy();
    };
  }, []);

  useEffect(() => drive.current(), [pose]);

  return <div className={`onboarding-pet${ready ? " is-ready" : ""}`} aria-hidden="true">
    <div ref={container} className="onboarding-pet-lottie" />
    {!ready && (pose === "intro"
      ? <img className="onboarding-pet-fallback" src="/story/redesign/intro-story.svg" alt="" />
      : pose === "angry" ? <img className="onboarding-angry-fallback" src="/story/redesign/angry-story.svg" alt="" />
      : <><img className="onboarding-happy-body" src="/story/redesign/happy-body.svg" alt="" />
        <img className="onboarding-cheek onboarding-cheek--left" src="/story/redesign/happy-cheek.svg" alt="" />
        <img className="onboarding-cheek onboarding-cheek--right" src="/story/redesign/happy-cheek.svg" alt="" /></>)}
  </div>;
}
