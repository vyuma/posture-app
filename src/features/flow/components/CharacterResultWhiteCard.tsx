import { forwardRef, type CSSProperties, type MouseEvent, type ReactElement } from "react";

import type { CharacterDefinition } from "../../characters/types";
import { getCharacterImageSrc } from "../../characters/characterCatalog";
import type { PostureTimelineSegment } from "../types";

import { PostureTimelineChart } from "./PostureTimelineChart";

/** 「78%」形式のラベルを数字と % に分けて表示用にする */
function splitPercentLabel(label: string): { main: string; suffix: string } | null {
  const m = /^(\d+)(%)$/.exec(label.trim());
  return m !== null ? { main: m[1], suffix: m[2] } : null;
}

export type CharacterResultWhiteCardProps = {
  /** ピンアナゴ未獲得時は acquisition-fail（failed_nago.png） */
  portraitMode: "character" | "qr-fail" | "acquisition-fail";
  character: CharacterDefinition | null;
  personalityTags: readonly string[];
  goodDurationLabel: string;
  goodRatioLabel: string;
  acquiredAtLabel: string;
  measurementDurationLabel: string;
  timelineSegments?: PostureTimelineSegment[];
  timelineTotalMs?: number;
  timelineVariant?: "success" | "fail";
  timelineGoodStrokeResolved?: string;
  shareBusy?: boolean;
  shareBusyAction?: "share" | "copy" | null;
  onShareClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onCopyClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  articleClassName?: string;
  articleStyle?: CSSProperties;
  onArticleClick?: (e: MouseEvent<HTMLElement>) => void;
  onArticleMouseMove?: (e: MouseEvent<HTMLElement>) => void;
  onArticleMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  /** ダイアログの aria-labelledby 用（任意） */
  characterNameId?: string;
  /** カード右カラム下部に表示するストーリー（獲得成功画面など） */
  characterStory?: string | null;
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
    acquiredAtLabel,
    measurementDurationLabel,
    timelineSegments,
    timelineTotalMs,
    timelineVariant,
    timelineGoodStrokeResolved,
    shareBusy = false,
    shareBusyAction = null,
    onShareClick,
    onCopyClick,
    articleClassName = "",
    articleStyle,
    onArticleClick,
    onArticleMouseMove,
    onArticleMouseLeave,
    characterNameId,
    characterStory = null,
  } = props;

  const ratioParts = splitPercentLabel(goodRatioLabel);

  const portraitInner: ReactElement =
    portraitMode === "acquisition-fail" ? (
      <img
        className="result-registered-figure result-registered-figure--acquisition-fail"
        src="/failed_nago.png"
        alt=""
        draggable={false}
      />
    ) : portraitMode === "qr-fail" ? (
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
      className={`result-registered-card result-registered-card--detail ${articleClassName}`.trim()}
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
        aria-label="統計"
      >
        {onShareClick !== undefined && onCopyClick !== undefined ? (
          <div className="result-registered-stats-header">
            <button
              type="button"
              className={`result-registered-share ${shareBusy && shareBusyAction === "share" ? "is-busy" : ""}`}
              aria-label="結果を画像で共有"
              disabled={shareBusy}
              onClick={(event) => {
                event.stopPropagation();
                onShareClick(event);
              }}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                <circle cx="6.3" cy="12" r="2.15" />
                <circle cx="17.7" cy="6.4" r="2.15" />
                <circle cx="17.7" cy="17.6" r="2.15" />
                <path d="M8.2 11.1 15.8 7.3M8.2 12.9l7.6 3.8" />
              </svg>
            </button>
            <button
              type="button"
              className={`result-registered-share result-registered-share--copy ${shareBusy && shareBusyAction === "copy" ? "is-busy" : ""}`}
              aria-label="結果を画像でコピー"
              disabled={shareBusy}
              onClick={(event) => {
                event.stopPropagation();
                onCopyClick(event);
              }}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M5 15V6.8C5 5.8 5.8 5 6.8 5H15" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="result-registered-stat-grid">
          <div className="result-registered-stat-cell">
            <span className="result-registered-stat-label">良い姿勢時間</span>
            <strong className="result-registered-stat-value">{goodDurationLabel}</strong>
          </div>
          <div className="result-registered-stat-cell">
            <span className="result-registered-stat-label">良い姿勢率</span>
            {ratioParts !== null ? (
              <strong
                className="result-registered-stat-value result-registered-stat-value--ratio-parts"
              >
                <span className="result-registered-stat-value-num">{ratioParts.main}</span>
                <span className="result-registered-stat-value-suffix">{ratioParts.suffix}</span>
              </strong>
            ) : (
              <strong className="result-registered-stat-value">{goodRatioLabel}</strong>
            )}
          </div>
        </div>

        {timelineSegments !== undefined &&
        timelineTotalMs !== undefined &&
        timelineVariant !== undefined &&
        timelineGoodStrokeResolved !== undefined ? (
          <PostureTimelineChart
            segments={timelineSegments}
            totalMs={timelineTotalMs}
            variant={timelineVariant}
            resolvedGoodStroke={timelineGoodStrokeResolved}
          />
        ) : null}

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

        {characterStory !== null && characterStory.length > 0 ? (
          <p className="result-registered-story">{characterStory}</p>
        ) : null}
      </section>
    </article>
  );
});
