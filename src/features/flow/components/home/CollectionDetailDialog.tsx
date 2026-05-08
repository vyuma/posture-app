import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";

import type {
  AcquiredCharacter,
  CharacterDefinition,
} from "../../../characters/types";
import { shareResultCapture } from "../../../../lib/shareResultCapture";
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
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const hasTimelineData =
    (acquiredCharacter.postureTimeline?.length ?? 0) > 0 &&
    (acquiredCharacter.activeMeasurementMs ?? 0) > 0;
  const timelineVariant = hasTimelineData ? "success" : "fail";

  const shareCardThemeVars = useMemo(() => {
    return {
      "--result-stat-accent": character.characterColor.primary,
      "--result-share-icon": character.characterColor.primary,
      "--result-meta-icon": character.characterColor.primary,
      "--result-portrait-bg": character.characterColor.soft,
      "--result-timeline-good": character.characterColor.primary,
    } as CSSProperties;
  }, [character]);

  const handleShareCollection = useCallback(async () => {
    if (shareCaptureRef.current === null || shareBusy) {
      return;
    }

    setShareBusy(true);
    setShareFeedback(null);

    try {
      const outcome = await shareResultCapture(shareCaptureRef.current);
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
    }
  }, [shareBusy]);

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
          <p className="collection-detail-eyebrow">今日のピンアナゴ</p>
          <button
            type="button"
            className="collection-detail-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <CharacterResultWhiteCard
          ref={shareCaptureRef}
          portraitMode="character"
          character={character}
          personalityTags={character.personalityTags}
          goodDurationLabel={formatOptionalDuration(acquiredCharacter.goodMs)}
          goodRatioLabel={formatOptionalPercent(acquiredCharacter.goodRatio)}
          timelineSegments={acquiredCharacter.postureTimeline ?? []}
          timelineTotalMs={acquiredCharacter.activeMeasurementMs ?? 0}
          timelineVariant={timelineVariant}
          timelineGoodStrokeResolved={
            hasTimelineData ? character.characterColor.primary : "#8a9399"
          }
          acquiredAtLabel={formatAcquiredAt(acquiredCharacter.acquiredAt)}
          measurementDurationLabel={formatOptionalDuration(
            acquiredCharacter.activeMeasurementMs,
          )}
          shareBusy={shareBusy}
          onShareClick={() => {
            void handleShareCollection();
          }}
          articleStyle={shareCardThemeVars}
          characterNameId="collection-detail-heading"
        />
        <div
          className="collection-detail-story-below"
          aria-labelledby="collection-detail-story-heading"
        >
          <h3 id="collection-detail-story-heading">ストーリー</h3>
          <p className="collection-detail-story">{character.story}</p>
        </div>
        <p className="collection-detail-share-feedback" role="status" aria-live="polite">
          {shareFeedback ?? ""}
        </p>
      </div>
    </section>
  );
}
