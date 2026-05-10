import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../../characters/types";
import { shareResultCapture } from "../../../../lib/shareResultCapture";
import { isTauriRuntime } from "../../../../lib/tauriRuntime";
import { CharacterResultWhiteCard } from "../CharacterResultWhiteCard";
import {
  formatAcquiredAt,
  formatOptionalDuration,
  formatOptionalPercent,
} from "../shared/formatters";

type CollectionDetailDialogProps = {
  isClosing: boolean;
  character: CharacterDefinition;
  acquiredCharacter: AcquiredCharacter;
  onClose: () => void;
};

export function CollectionDetailDialog({
  isClosing,
  character,
  acquiredCharacter,
  onClose,
}: CollectionDetailDialogProps) {
  const shareCaptureRef = useRef<HTMLElement>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareBusyAction, setShareBusyAction] = useState<"share" | "copy" | null>(
    null,
  );
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const shareCardThemeVars = useMemo(() => {
    return {
      "--result-stat-accent": character.characterColor.primary,
      "--result-share-icon": character.characterColor.primary,
      "--result-meta-icon": character.characterColor.primary,
      "--result-portrait-bg": character.characterColor.soft,
    } as CSSProperties;
  }, [character]);

  const handleShareCollection = useCallback(
    async (mode: "share" | "copy") => {
      if (shareCaptureRef.current === null || shareBusy) {
        return;
      }

      setShareBusy(true);
      setShareBusyAction(mode === "copy" ? "copy" : "share");
      setShareFeedback(null);

      try {
        const outcome = await shareResultCapture(shareCaptureRef.current, {
          action: mode === "copy" ? "copy" : "auto",
        });
        if (outcome === "downloaded") {
          setShareFeedback("画像をダウンロードしました");
        } else if (outcome === "copied") {
          setShareFeedback("画像をクリップボードにコピーしました");
        } else {
          setShareFeedback(null);
        }
      } catch {
        setShareFeedback("共有に失敗しました。もう一度お試しください。");
      } finally {
        setShareBusy(false);
        setShareBusyAction(null);
      }
    },
    [shareBusy],
  );

  return (
    <section
      className={`collection-detail-backdrop${isClosing ? " is-closing" : ""}`}
      role="presentation"
      onMouseDown={isClosing ? undefined : onClose}
    >
      <div
        className="collection-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-detail-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="collection-detail-header">
          <button
            type="button"
            className="collection-detail-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="result-registered-card-block">
          <CharacterResultWhiteCard
            ref={shareCaptureRef}
            portraitMode="character"
            character={character}
            personalityTags={character.personalityTags}
            goodDurationLabel={formatOptionalDuration(acquiredCharacter.goodMs)}
            goodRatioLabel={formatOptionalPercent(acquiredCharacter.goodRatio)}
            acquiredAtLabel={formatAcquiredAt(acquiredCharacter.acquiredAt)}
            measurementDurationLabel={formatOptionalDuration(
              acquiredCharacter.activeMeasurementMs,
            )}
            articleStyle={shareCardThemeVars}
            characterNameId="collection-detail-heading"
          />
          <div
            className="result-registered-outside-actions"
            role="toolbar"
            aria-label="結果画像の共有と保存"
          >
            <button
              type="button"
              className={`result-registered-outside-action${
                shareBusy && shareBusyAction === "share" ? " is-busy" : ""
              }`}
              aria-label="結果を画像で共有"
              title="結果を画像で共有（または保存）します"
              disabled={shareBusy}
              aria-disabled={shareBusy}
              aria-busy={shareBusy && shareBusyAction === "share"}
              onClick={() => {
                void handleShareCollection("share");
              }}
            >
              <img src="/share.png" alt="" width={32} height={32} draggable={false} />
            </button>
            <button
              type="button"
              className={`result-registered-outside-action${
                shareBusy && shareBusyAction === "copy" ? " is-busy" : ""
              }`}
              aria-label="結果を画像でコピー"
              title="結果を画像でコピー"
              disabled={shareBusy}
              aria-disabled={shareBusy}
              aria-busy={shareBusy && shareBusyAction === "copy"}
              onClick={() => {
                void handleShareCollection("copy");
              }}
            >
              <img src="/download.png" alt="" width={32} height={32} draggable={false} />
            </button>
          </div>
        </div>
        {isTauriRuntime() && character.story.trim().length > 0 ? (
          <div
            className="collection-detail-story-below"
            aria-labelledby="collection-detail-story-heading"
          >
            <h3 id="collection-detail-story-heading">ストーリー</h3>
            <p className="collection-detail-story">{character.story}</p>
          </div>
        ) : null}
        <p className="collection-detail-share-feedback" role="status" aria-live="polite">
          {shareFeedback ?? ""}
        </p>
      </div>
    </section>
  );
}
