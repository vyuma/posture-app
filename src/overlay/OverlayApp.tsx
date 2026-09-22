import { type PointerEvent, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  OVERLAY_PLACEMENT_HINT_REFRESH_EVENT,
} from "../features/overlay/overlayPlacementHintBridge";
import { WebInlineCharacterOverlay } from "../features/overlay/WebInlineCharacterOverlay";
import {
  clearPlacementHintDismissed,
  DEFAULT_OVERLAY_STATE,
  loadPlacementHintDismissed,
  loadStoredPositionOffset,
  savePlacementHintDismissed,
  type OverlayMode,
  type OverlayStatePayload,
} from "../features/overlay/overlayState";

export function OverlayApp() {
  const dragRequested = useRef(false);
  const [overlayState, setOverlayState] =
    useState<OverlayStatePayload>(DEFAULT_OVERLAY_STATE);
  /** 配置説明の吹き出し：初回はフキダシ表示。ドラッグで実際に動かしたら以後非表示。 */
  const [isPlacementHintVisible, setIsPlacementHintVisible] = useState(
    () => !loadPlacementHintDismissed(),
  );
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
        void invoke("overlay_restore_position", {
          offsetX: storedOffset.x, offsetY: storedOffset.y,
        }).catch(() => {});
      })
      .catch(() => {
        // The overlay can still render once the next state event arrives.
      });

    const unlistenPromise = listen<OverlayStatePayload>(
      "overlay:state",
      ({ payload }) => {
        applyState(payload);
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
    const promise = listen(OVERLAY_PLACEMENT_HINT_REFRESH_EVENT, () => {
      clearPlacementHintDismissed();
      setIsPlacementHintVisible(true);
    });
    return () => {
      void promise.then((unlisten) => unlisten());
    };
  }, []);

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

  const handleCharacterPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !isTauri()) return;
    event.preventDefault();
    // Native dragging keeps physical/logical coordinates consistent across displays.
    // Do not capture the pointer: the OS owns the drag until mouse-up.
    dragRequested.current = true;
    void getCurrentWindow().startDragging().catch(() => { dragRequested.current = false; });
  };

  useEffect(() => {
    if (!isTauri()) return;
    const promise = getCurrentWindow().onMoved(() => {
      if (!dragRequested.current) return;
      dragRequested.current = false;
      setIsPlacementHintVisible(false);
      savePlacementHintDismissed();
    });
    return () => { void promise.then((unlisten) => unlisten()); };
  }, []);

  return (
    <main
      className={[
        "overlay-shell",
        displayMode ? `overlay-shell--${displayMode}` : "overlay-shell--hidden",
        displayMode && isPlacementHintVisible
          ? "overlay-shell--placement-hint"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
            className="overlay-character"
            onPointerDown={handleCharacterPointerDown}
          >
            {isPlacementHintVisible ? (
              <div
                className="overlay-placement-hint"
                role="note"
                aria-label="どこに配置する？ ドラッグで動かそう！"
              >
                <div className="overlay-placement-hint-body">
                  <span className="overlay-placement-hint-default">
                    どこに配置する？
                  </span>
                  <span className="overlay-placement-hint-hover">
                    ドラッグで動かそう！
                  </span>
                </div>
              </div>
            ) : null}
            <WebInlineCharacterOverlay mode={displayMode} />
          </div>
        </>
      ) : null}
    </main>
  );
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
