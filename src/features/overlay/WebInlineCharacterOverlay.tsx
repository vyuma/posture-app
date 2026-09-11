import type { AnimationItem } from "lottie-web";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import "./WebInlineCharacterOverlay.css";
import type { OverlayMode } from "./overlayState";

type VisibleOverlayMode = Exclude<OverlayMode, "hidden">;
type TransitionKey = `${VisibleOverlayMode}:${VisibleOverlayMode}`;

const ANIMATION_PATH = "/animations/anago/normal-nago/overlay.json";

const STATE_FRAMES: Record<VisibleOverlayMode, number> = {
  good: 0,
  bad: 1,
  paused: 2,
};

const ENTER_SEGMENTS: Record<VisibleOverlayMode, [number, number]> = {
  good: [3, 32],
  bad: [33, 62],
  paused: [63, 92],
};

const EXIT_SEGMENTS: Record<VisibleOverlayMode, [number, number]> = {
  good: [93, 122],
  bad: [123, 152],
  paused: [153, 182],
};

const TRANSITION_SEGMENTS: Partial<
  Record<TransitionKey, [number, number]>
> = {
  "good:bad": [183, 212],
  // One uninterrupted recovery: bad -> original happy (hold) -> good.
  "bad:good": [213, 287],
  "good:paused": [288, 317],
  "paused:good": [318, 347],
  "bad:paused": [348, 377],
  "paused:bad": [378, 407],
};

/** OverlayApp.tsx と同値：姿勢が悪いと下へ沈み、ほぼ見えなくなるまで進む */
const BAD_SINK_MAX_PX = 136;
const BAD_SINK_PX_PER_SECOND = 34;

type WebInlineCharacterOverlayProps = {
  mode: VisibleOverlayMode | null;
  sinkEnabled?: boolean;
};

/**
 * ブラウザ版：viewport 右下へベクターキャラを重ね、状態遷移を順番に再生する。
 * 遷移中に次の状態が来た場合は中断せずキューし、必ず完成ポーズから次へつなぐ。
 */
export function WebInlineCharacterOverlay({ mode, sinkEnabled = true }: WebInlineCharacterOverlayProps) {
  const [badSinkPx, setBadSinkPx] = useState(0);
  const [isAnimationReady, setIsAnimationReady] = useState(false);
  const [shouldRender, setShouldRender] = useState(mode !== null);
  const [settledMode, setSettledMode] = useState<VisibleOverlayMode | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const animationContainerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const requestedModeRef = useRef<VisibleOverlayMode | null>(mode);
  const visualModeRef = useRef<VisibleOverlayMode>(mode ?? "good");
  const hasEnteredRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const completeHandlerRef = useRef<(() => void) | null>(null);
  const driveAnimationRef = useRef<() => void>(() => undefined);

  const removeCompleteHandler = () => {
    const animation = animationRef.current;
    const handler = completeHandlerRef.current;
    if (animation && handler) {
      animation.removeEventListener("complete", handler);
    }
    completeHandlerRef.current = null;
  };

  const playSegment = (
    segment: [number, number],
    onComplete: () => void,
  ) => {
    const animation = animationRef.current;
    if (!animation) return;

    removeCompleteHandler();
    isTransitioningRef.current = true;
    setSettledMode(null);
    const handleComplete = () => {
      removeCompleteHandler();
      isTransitioningRef.current = false;
      onComplete();
    };
    completeHandlerRef.current = handleComplete;
    animation.addEventListener("complete", handleComplete);
    animation.loop = false;
    animation.setDirection(1);
    animation.playSegments(segment, true);
  };

  const settleAtState = (nextMode: VisibleOverlayMode) => {
    const animation = animationRef.current;
    if (!animation) return;

    visualModeRef.current = nextMode;
    setSettledMode(nextMode);
    animation.resetSegments(true);
    animation.goToAndStop(STATE_FRAMES[nextMode], true);
  };

  const driveAnimation = () => {
    const animation = animationRef.current;
    if (
      !animation ||
      !isAnimationReady ||
      !shouldRender ||
      isTransitioningRef.current
    ) {
      return;
    }

    const requestedMode = requestedModeRef.current;

    if (prefersReducedMotion) {
      if (requestedMode === null) {
        hasEnteredRef.current = false;
        setShouldRender(false);
        return;
      }

      hasEnteredRef.current = true;
      settleAtState(requestedMode);
      return;
    }

    if (!hasEnteredRef.current) {
      if (requestedMode === null) {
        setShouldRender(false);
        return;
      }

      playSegment(ENTER_SEGMENTS[requestedMode], () => {
        hasEnteredRef.current = true;
        settleAtState(requestedMode);
        driveAnimationRef.current();
      });
      return;
    }

    const visualMode = visualModeRef.current;
    if (requestedMode === null) {
      playSegment(EXIT_SEGMENTS[visualMode], () => {
        if (requestedModeRef.current === null) {
          hasEnteredRef.current = false;
          setShouldRender(false);
        } else {
          hasEnteredRef.current = false;
          driveAnimationRef.current();
        }
      });
      return;
    }

    if (requestedMode === visualMode) {
      settleAtState(requestedMode);
      return;
    }

    const transitionKey: TransitionKey = `${visualMode}:${requestedMode}`;
    const segment = TRANSITION_SEGMENTS[transitionKey];
    if (!segment) {
      settleAtState(requestedMode);
      return;
    }

    playSegment(segment, () => {
      settleAtState(requestedMode);
      driveAnimationRef.current();
    });
  };

  driveAnimationRef.current = driveAnimation;

  useEffect(() => {
    requestedModeRef.current = mode;

    if (mode !== null && !shouldRender) {
      visualModeRef.current = mode;
      hasEnteredRef.current = false;
      setSettledMode(null);
      setShouldRender(true);
      return;
    }

    driveAnimationRef.current();
  }, [mode, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;

    const container = animationContainerRef.current;
    if (!container) return;

    let disposed = false;
    let loadedAnimation: AnimationItem | null = null;
    setIsAnimationReady(false);

    void import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (disposed) return;

      const animation = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: false,
        autoplay: false,
        path: ANIMATION_PATH,
        rendererSettings: {
          preserveAspectRatio: "xMidYMax meet",
        },
      });
      loadedAnimation = animation;
      animationRef.current = animation;

      const handleReady = () => {
        if (!disposed) setIsAnimationReady(true);
      };
      animation.addEventListener("DOMLoaded", handleReady);

      if (animation.isLoaded) {
        handleReady();
      }
    });

    return () => {
      disposed = true;
      removeCompleteHandler();
      isTransitioningRef.current = false;
      loadedAnimation?.destroy();
      if (animationRef.current === loadedAnimation) {
        animationRef.current = null;
      }
      setIsAnimationReady(false);
    };
  }, [shouldRender]);

  useEffect(() => {
    if (isAnimationReady) {
      driveAnimationRef.current();
    }
  }, [isAnimationReady]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    mediaQuery.addEventListener("change", syncMotionPreference);
    return () => {
      mediaQuery.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion && isTransitioningRef.current) {
      removeCompleteHandler();
      animationRef.current?.pause();
      isTransitioningRef.current = false;
    }
    driveAnimationRef.current();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (mode === null) return;

    if (mode !== "bad" || !sinkEnabled) {
      setBadSinkPx(0);
      return;
    }
    // Let the head finish drooping before the whole character starts sinking.
    if (settledMode !== "bad") return;

    const badStartedAt = performance.now();
    setBadSinkPx(0);

    const intervalId = window.setInterval(() => {
      const elapsedSeconds = (performance.now() - badStartedAt) / 1000;
      setBadSinkPx(
        Math.min(BAD_SINK_MAX_PX, elapsedSeconds * BAD_SINK_PX_PER_SECOND),
      );
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [mode, settledMode, sinkEnabled]);

  if (!shouldRender) return null;

  const displayMode = mode ?? visualModeRef.current;
  const sinkStyle: CSSProperties = {
    transform: `translateY(${badSinkPx}px)`,
    transition:
      mode === "bad"
        ? "transform 140ms linear"
        : "transform 720ms cubic-bezier(0.22, 1, 0.36, 1)",
  };

  return (
    <div
      className={`web-inline-character-overlay web-inline-character-overlay--${displayMode}`}
      aria-hidden
    >
      <div className="web-inline-character-sink" style={sinkStyle}>
        <div className="web-inline-character">
          <div
            ref={animationContainerRef}
            className="web-inline-character-lottie"
          />
        </div>
      </div>
    </div>
  );
}
