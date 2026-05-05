import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import lottie, { type AnimationItem } from "lottie-web";

type OverlayPhase = "hidden" | "entering" | "idle" | "exiting";

type OverlayPhasePayload = {
  phase: OverlayPhase;
};

const ENTER_END = 30;
const IDLE_START = 30;
const IDLE_END = 77;
const DEFAULT_PHASE: OverlayPhase = "hidden";
const ANIMATION_JSON_PATH = "/model/cat.json";

export function OverlayApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const currentPhaseRef = useRef<OverlayPhase>(DEFAULT_PHASE);
  const appliedPhaseRef = useRef<OverlayPhase>(DEFAULT_PHASE);
  const totalFramesRef = useRef<number>(120);
  const frameRateRef = useRef<number>(25);
  const completionFallbackRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      if (!containerRef.current) {
        return;
      }

      const response = await fetch(ANIMATION_JSON_PATH);
      const animationData = await response.json();

      if (disposed || !containerRef.current) {
        return;
      }

      const animation = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData,
        rendererSettings: {
          preserveAspectRatio: "xMidYMax slice",
        },
      });

      animationRef.current = animation;
      totalFramesRef.current = Math.max(1, Math.floor(animation.getDuration(true)));
      frameRateRef.current =
        typeof animationData?.fr === "number" && animationData.fr > 0
          ? animationData.fr
          : 25;
      animation.setSpeed(1);
      animation.setSubframe(true);

      animation.addEventListener("complete", () => {
        const phase = currentPhaseRef.current;

        if (phase === "idle") {
          playIdleSegment();
          return;
        }

        if (phase === "entering") {
          void invoke("overlay_on_animation_complete", { phase }).catch(() => {
            // Keep overlay resilient even if command bridge is temporarily unavailable.
          });
        }
      });

      const initialPhase = await invoke<string>("overlay_get_phase").catch(
        () => DEFAULT_PHASE,
      );
      playPhase(initialPhase as OverlayPhase);
    }

    void boot();

    const unlistenPromise = listen<OverlayPhasePayload>(
      "overlay:phase",
      ({ payload }) => {
        playPhase(payload.phase);
      },
    );

    const syncIntervalId = window.setInterval(() => {
      void invoke<string>("overlay_get_phase")
        .then((phase) => {
          const normalized = phase as OverlayPhase;
          if (normalized !== appliedPhaseRef.current) {
            playPhase(normalized);
          }
        })
        .catch(() => {
          // Ignore intermittent sync errors.
        });
    }, 900);

    return () => {
      disposed = true;
      if (completionFallbackRef.current !== null) {
        window.clearTimeout(completionFallbackRef.current);
        completionFallbackRef.current = null;
      }
      window.clearInterval(syncIntervalId);
      animationRef.current?.destroy();
      animationRef.current = null;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const playIdleSegment = () => {
    const animation = animationRef.current;
    if (!animation) {
      return;
    }

    animation.loop = false;
    animation.playSegments([IDLE_START, IDLE_END], true);
  };

  const playPhase = (phase: OverlayPhase) => {
    const animation = animationRef.current;
    if (!animation) {
      return;
    }

    if (completionFallbackRef.current !== null) {
      window.clearTimeout(completionFallbackRef.current);
      completionFallbackRef.current = null;
    }

    currentPhaseRef.current = phase;
    appliedPhaseRef.current = phase;
    animation.stop();
    const scheduleCompleteFallback = (
      phaseForFallback: "entering" | "exiting",
      startFrame: number,
      endFrame: number,
    ) => {
      const frameDistance = Math.max(1, Math.abs(endFrame - startFrame));
      const timeoutMs =
        Math.ceil((frameDistance / Math.max(frameRateRef.current, 1)) * 1000) + 180;

      completionFallbackRef.current = window.setTimeout(() => {
        if (currentPhaseRef.current !== phaseForFallback) {
          return;
        }
        void invoke("overlay_on_animation_complete", {
          phase: phaseForFallback,
        }).catch(() => {
          // Keep overlay resilient even if command bridge is temporarily unavailable.
        });
      }, timeoutMs);
    };

    switch (phase) {
      case "hidden":
        animation.setDirection(1);
        animation.goToAndStop(0, true);
        break;
      case "entering":
        animation.setDirection(1);
        animation.loop = false;
        animation.playSegments([0, ENTER_END], true);
        scheduleCompleteFallback("entering", 0, ENTER_END);
        break;
      case "idle":
        animation.setDirection(1);
        playIdleSegment();
        break;
      case "exiting":
        animation.setDirection(-1);
        animation.loop = false;
        animation.goToAndStop(ENTER_END, true);
        animation.playSegments([ENTER_END, 0], true);
        scheduleCompleteFallback("exiting", ENTER_END, 0);
        break;
      default:
        break;
    }
  };

  return (
    <main className="overlay-shell" aria-hidden="true">
      <div ref={containerRef} className="overlay-animation" />
    </main>
  );
}
