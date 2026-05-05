import { type PointerEvent, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import {
  clampPositionOffset,
  DEFAULT_OVERLAY_STATE,
  loadStoredPositionOffset,
  storePositionOffset,
  type OverlayMode,
  type OverlayStatePayload,
  type PositionOffset,
} from "../features/overlay/overlayState";

const CHARACTER_SRC: Record<Exclude<OverlayMode, "hidden">, string> = {
  good: "/characters/anago/normal-nago/expressions/good.svg",
  bad: "/characters/anago/normal-nago/expressions/bad.svg",
  paused: "/characters/anago/normal-nago/expressions/paused.svg",
};

const BAD_SINK_MAX_PX = 78;
const BAD_SINK_PX_PER_SECOND = 8;

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffset: PositionOffset;
};

export function OverlayApp() {
  const [overlayState, setOverlayState] =
    useState<OverlayStatePayload>(DEFAULT_OVERLAY_STATE);
  const [badSinkPx, setBadSinkPx] = useState(0);
  const [positionOffset, setPositionOffset] = useState<PositionOffset>(() =>
    loadStoredPositionOffset(),
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const positionOffsetRef = useRef(positionOffset);

  useEffect(() => {
    positionOffsetRef.current = positionOffset;
  }, [positionOffset]);

  useEffect(() => {
    let disposed = false;

    const applyState = (state: OverlayStatePayload) => {
      if (!disposed) {
        setOverlayState(state);
      }
    };

    void invoke<OverlayStatePayload>("overlay_get_state")
      .then((state) => {
        applyState(state);
        const storedOffset = loadStoredPositionOffset();
        setPositionOffset(storedOffset);
        void syncPositionOffset(storedOffset).catch(() => {
          // Browser preview cannot reach native position commands.
        });
      })
      .catch(() => {
        // The overlay can still render once the next state event arrives.
      });

    const unlistenPromise = listen<OverlayStatePayload>(
      "overlay:state",
      ({ payload }) => {
        applyState(payload);
        const nextOffset = { x: payload.offsetX, y: payload.offsetY };
        setPositionOffset(nextOffset);
        storePositionOffset(nextOffset);
      },
    );

    const syncIntervalId = window.setInterval(() => {
      void invoke<OverlayStatePayload>("overlay_get_state")
        .then(applyState)
        .catch(() => {
          // Ignore intermittent bridge errors.
        });
    }, 1200);

    return () => {
      disposed = true;
      window.clearInterval(syncIntervalId);
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (overlayState.mode !== "bad") {
      setBadSinkPx(0);
      return;
    }

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
  }, [overlayState.mode]);

  const displayMode: Exclude<OverlayMode, "hidden"> | null =
    overlayState.mode === "hidden" || overlayState.userHidden
      ? null
      : overlayState.mode;

  const handleHide = () => {
    void invoke("overlay_hide_character").catch(() => {
      // Keep the hover menu responsive even if the native bridge is unavailable.
    });
  };

  const handleOpenApp = () => {
    void invoke("overlay_open_main_window").catch(() => {
      // The character overlay should never crash from a failed focus request.
    });
  };

  const handleCharacterPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: positionOffsetRef.current,
    };
    setIsDragging(true);
  };

  const handleCharacterPointerMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextOffset = clampPositionOffset({
      x: dragState.startOffset.x + event.clientX - dragState.startClientX,
      y: dragState.startOffset.y + event.clientY - dragState.startClientY,
    });

    setPositionOffset(nextOffset);
    storePositionOffset(nextOffset);
    void syncPositionOffset(nextOffset).catch(() => {
      // Ignore transient native bridge failures while dragging.
    });
  };

  const handleCharacterPointerEnd = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <main
      className={`overlay-shell ${displayMode ? `overlay-shell--${displayMode}` : "overlay-shell--hidden"}`}
      aria-hidden={!displayMode}
    >
      {displayMode ? (
        <>
          <div className="overlay-actions" aria-label="キャラクター操作">
            <button
              type="button"
              className="overlay-action"
              aria-label="非表示"
              title="非表示"
              onClick={handleHide}
            >
              <EyeOffIcon />
            </button>
            <button
              type="button"
              className="overlay-action"
              aria-label="アプリを開く"
              title="アプリを開く"
              onClick={handleOpenApp}
            >
              <OpenIcon />
            </button>
          </div>
          <div
            className={`overlay-character ${isDragging ? "overlay-character--dragging" : ""}`}
            style={{ transform: `translate(-50%, ${badSinkPx}px)` }}
            onPointerDown={handleCharacterPointerDown}
            onPointerMove={handleCharacterPointerMove}
            onPointerUp={handleCharacterPointerEnd}
            onPointerCancel={handleCharacterPointerEnd}
          >
            <img
              src={CHARACTER_SRC[displayMode]}
              alt=""
              draggable={false}
            />
          </div>
        </>
      ) : null}
    </main>
  );
}

async function syncPositionOffset(offset: PositionOffset) {
  await invoke("overlay_set_position_offset", {
    offsetX: offset.x,
    offsetY: offset.y,
  });
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.7 10.7a1.8 1.8 0 0 0 2.6 2.6" />
      <path d="M8.4 5.6A10.2 10.2 0 0 1 12 5c5.2 0 8.7 4.4 9.7 6.1a1.7 1.7 0 0 1 0 1.8 14.1 14.1 0 0 1-2.1 2.6" />
      <path d="M6.2 7.1a14.2 14.2 0 0 0-3.9 4 1.7 1.7 0 0 0 0 1.8C3.3 14.6 6.8 19 12 19a10.4 10.4 0 0 0 4.8-1.2" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5H5v14h14v-4" />
      <path d="M13 5h6v6" />
      <path d="M11 13 19 5" />
    </svg>
  );
}
