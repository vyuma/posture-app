import {
  forwardRef,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
} from "react";

import type { CharacterDefinition } from "../../characters/types";
import { getCharacterImageSrc } from "../../characters/characterCatalog";
import type { PostureTimelineSegment } from "../types";

import { PostureTimelineChart } from "./PostureTimelineChart";

export type CharacterResultWhiteCardProps = {
  portraitMode: "character" | "qr-fail";
  character: CharacterDefinition | null;
  personalityTags: readonly string[];
  goodDurationLabel: string;
  goodRatioLabel: string;
  timelineSegments: PostureTimelineSegment[];
  timelineTotalMs: number;
  timelineVariant: "success" | "fail";
  /** html-to-image 向けに「良い」ライン色を確定（HEX 推奨） */
  timelineGoodStrokeResolved: string;
  acquiredAtLabel: string;
  measurementDurationLabel: string;
  shareBusy: boolean;
  shareBusyAction?: "share" | "copy" | null;
  onShareClick: (e: MouseEvent<HTMLButtonElement>) => void;
  onCopyClick: (e: MouseEvent<HTMLButtonElement>) => void;
  articleClassName?: string;
  articleStyle?: CSSProperties;
  onArticleClick?: (e: MouseEvent<HTMLElement>) => void;
  onArticleMouseMove?: (e: MouseEvent<HTMLElement>) => void;
  onArticleMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  /** ダイアログの aria-labelledby 用（任意） */
  characterNameId?: string;
};

function RegisteredCalendarGlyph() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden focusable={false}>
      <rect x="3" y="4" width="14" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M8 2v4M12 2v4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function RegisteredClockGlyph() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden focusable={false}>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 7v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 測定結果の白カード（獲得画面・コレクション詳細で同一 DOM/CSS を共有）
 */
export const CharacterResultWhiteCard = forwardRef<
  HTMLElement,
  CharacterResultWhiteCardProps
>(function CharacterResultWhiteCard(props, ref) {
  const {
    portraitMode,
    character,
    personalityTags,
    goodDurationLabel,
    goodRatioLabel,
    timelineSegments,
    timelineTotalMs,
    timelineVariant,
    timelineGoodStrokeResolved,
    acquiredAtLabel,
    measurementDurationLabel,
    shareBusy,
    shareBusyAction = null,
    onShareClick,
    onCopyClick,
    articleClassName = "",
    articleStyle,
    onArticleClick,
    onArticleMouseMove,
    onArticleMouseLeave,
    characterNameId,
  } = props;

  const portraitInner: ReactElement =
    portraitMode === "qr-fail" ? (
      <img
        className="result-registered-figure result-registered-figure--qr-fail"
        src="/logo/QRアナゴ.png"
        alt=""
        draggable={false}
      />
    ) : character !== null ? (
      <img
        className={`result-registered-figure character-figure ${character.toneClass ?? ""}`}
        src={getCharacterImageSrc(character)}
        alt=""
        draggable={false}
      />
    ) : (
      <div className="result-registered-figure character-empty" aria-hidden />
    );

  const displayName =
    portraitMode === "character" && character !== null
      ? character.name
      : "？？？？？";

  return (
    <article
      ref={ref}
      className={`result-registered-card ${articleClassName}`.trim()}
      aria-label="測定結果"
      style={articleStyle}
      onClick={onArticleClick}
      onMouseMove={onArticleMouseMove}
      onMouseLeave={onArticleMouseLeave}
    >
      <section
        className="result-registered-col result-registered-col--character"
        aria-label="キャラクター"
      >
        <div className="result-registered-portrait">{portraitInner}</div>
        <p className="result-registered-name" id={characterNameId}>
          {displayName}
        </p>
        <ul className="result-registered-tags">
          {personalityTags.map((tag, index) => (
            <li key={`${tag}-${index}`} className="result-registered-tag">
              {tag}
            </li>
          ))}
        </ul>
      </section>

      <section
        className="result-registered-col result-registered-col--stats"
        aria-label="統計とタイムライン"
      >
        <div className="result-registered-stats-header">
          <button
            type="button"
            className={`result-registered-share ${
              shareBusy && shareBusyAction === "share" ? "is-busy" : ""
            }`}
            aria-label="結果を画像で共有"
            title="結果を画像で共有（または保存）します"
            disabled={shareBusy}
            aria-disabled={shareBusy}
            aria-busy={shareBusy && shareBusyAction === "share"}
            onClick={(e) => {
              e.stopPropagation();
              onShareClick(e);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="6.3" cy="12" r="2.15" />
              <circle cx="17.7" cy="6.4" r="2.15" />
              <circle cx="17.7" cy="17.6" r="2.15" />
              <path d="M8.2 11.1 15.8 7.3M8.2 12.9l7.6 3.8" />
            </svg>
          </button>
          <button
            type="button"
            className={`result-registered-share result-registered-share--copy ${
              shareBusy && shareBusyAction === "copy" ? "is-busy" : ""
            }`}
            aria-label="結果を画像でコピー"
            title="結果を画像でコピー"
            disabled={shareBusy}
            aria-disabled={shareBusy}
            aria-busy={shareBusy && shareBusyAction === "copy"}
            onClick={(e) => {
              e.stopPropagation();
              onCopyClick(e);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="8" y="8" width="11" height="11" rx="2" />
              <path d="M5 15V6.8C5 5.8 5.8 5 6.8 5H15" />
            </svg>
          </button>
        </div>

        <div className="result-registered-stat-grid">
          <div className="result-registered-stat-cell">
            <span className="result-registered-stat-label">良い姿勢時間</span>
            <strong className="result-registered-stat-value">{goodDurationLabel}</strong>
          </div>
          <div className="result-registered-stat-cell">
            <span className="result-registered-stat-label">良い姿勢率</span>
            <strong className="result-registered-stat-value">{goodRatioLabel}</strong>
          </div>
        </div>

        <PostureTimelineChart
          segments={timelineSegments}
          totalMs={timelineTotalMs}
          variant={timelineVariant}
          resolvedGoodStroke={timelineGoodStrokeResolved}
        />

        <dl className="result-registered-meta">
          <div className="result-registered-meta-row">
            <dt className="result-registered-meta-label">
              <span className="result-registered-meta-icon" aria-hidden>
                <RegisteredCalendarGlyph />
              </span>
              獲得日
            </dt>
            <dd className="result-registered-meta-value">{acquiredAtLabel}</dd>
          </div>
          <div className="result-registered-meta-row">
            <dt className="result-registered-meta-label">
              <span className="result-registered-meta-icon" aria-hidden>
                <RegisteredClockGlyph />
              </span>
              測定時間
            </dt>
            <dd className="result-registered-meta-value">{measurementDurationLabel}</dd>
          </div>
        </dl>
      </section>
    </article>
  );
});
