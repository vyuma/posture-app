import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  playAcquisitionConfetti,
  playCardTapConfetti,
} from "../../../../lib/playAcquisitionConfetti";
import { shareResultCapture } from "../../../../lib/shareResultCapture";
import { isTauriRuntime } from "../../../../lib/tauriRuntime";
import { CharacterResultWhiteCard } from "../CharacterResultWhiteCard";
import type { PostureRegisteredScreenProps } from "../flowScreenTypes";
import {
  onResultCardMouseLeave,
  onResultCardMouseMove,
} from "../shared/cardTilt";
import { FlowBrand } from "../shared/FlowBrand";
import {
  formatAcquiredAt,
  formatDuration,
  formatPercent,
} from "../shared/formatters";

export function PostureRegisteredScreen({
  result,
  acquiredCharacter,
  onBackHome,
}: PostureRegisteredScreenProps) {
  const wasSuccessful =
    Boolean(result.rewardQualified) && acquiredCharacter !== null;
  const accentVariant = wasSuccessful ? "success" : "fail";

  const shareCaptureRef = useRef<HTMLElement>(null);
  const resultCardEnterTimerRef = useRef<number | null>(null);
  const resultCardTapFrameRef = useRef<number | null>(null);
  const resultCardTapResetTimerRef = useRef<number | null>(null);
  const [isResultCardEntering, setIsResultCardEntering] = useState(false);
  const [isResultCardTapped, setIsResultCardTapped] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareBusyAction, setShareBusyAction] = useState<"share" | "copy" | null>(
    null,
  );
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const displayCharacter = wasSuccessful ? acquiredCharacter : null;
  const personalityTags = wasSuccessful
    ? (
        displayCharacter !== null && displayCharacter.personalityTags.length > 0
          ? displayCharacter.personalityTags.slice(0, 2)
          : ["？？？？？", "？？？？？"]
      )
    : (["？？？？？", "？？？？？"] as const);

  const characterThemeVars = useMemo(() => {
    if (!wasSuccessful || acquiredCharacter === null) {
      return undefined;
    }
    return {
      "--result-stat-accent": acquiredCharacter.characterColor.primary,
      "--result-share-icon": acquiredCharacter.characterColor.primary,
      "--result-meta-icon": acquiredCharacter.characterColor.primary,
      "--result-portrait-bg": acquiredCharacter.characterColor.soft,
    } as CSSProperties;
  }, [wasSuccessful, acquiredCharacter]);

  const shareCardThemeVars = useMemo(() => {
    if (wasSuccessful && acquiredCharacter !== null) {
      return {
        "--result-stat-accent": acquiredCharacter.characterColor.primary,
        "--result-share-icon": acquiredCharacter.characterColor.primary,
        "--result-meta-icon": acquiredCharacter.characterColor.primary,
        "--result-portrait-bg": acquiredCharacter.characterColor.soft,
      } as CSSProperties;
    }
    return {
      "--result-stat-accent": "#979797",
      "--result-share-icon": "#979797",
      "--result-meta-icon": "#979797",
      "--result-portrait-bg": "rgba(151, 151, 151, 0.2)",
    } as CSSProperties;
  }, [wasSuccessful, acquiredCharacter]);

  const handleResultCapture = useCallback(
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
          const msg = "画像をダウンロードしました";
          setShareFeedback(msg);
          window.setTimeout(() => {
            setShareFeedback((current) => (current === msg ? null : current));
          }, 4200);
        } else if (outcome === "copied") {
          const msg = "画像をクリップボードにコピーしました";
          setShareFeedback(msg);
          window.setTimeout(() => {
            setShareFeedback((current) => (current === msg ? null : current));
          }, 4200);
        } else if (outcome === "shared") {
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

  useEffect(() => {
    return () => {
      if (resultCardEnterTimerRef.current !== null) {
        window.clearTimeout(resultCardEnterTimerRef.current);
      }
      if (resultCardTapFrameRef.current !== null) {
        window.cancelAnimationFrame(resultCardTapFrameRef.current);
      }
      if (resultCardTapResetTimerRef.current !== null) {
        window.clearTimeout(resultCardTapResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (resultCardEnterTimerRef.current !== null) {
      window.clearTimeout(resultCardEnterTimerRef.current);
      resultCardEnterTimerRef.current = null;
    }

    if (!wasSuccessful) {
      setIsResultCardEntering(false);
      return;
    }

    setIsResultCardEntering(true);
    resultCardEnterTimerRef.current = window.setTimeout(() => {
      setIsResultCardEntering(false);
      resultCardEnterTimerRef.current = null;
    }, 760);
  }, [wasSuccessful, result.id]);

  const handleResultCardTap = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!wasSuccessful || acquiredCharacter === null) {
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest("button")
    ) {
      return;
    }

    const cardElement = event.currentTarget;
    const rect = cardElement.getBoundingClientRect();
    const clickX = event.clientX || rect.left + rect.width / 2;
    const clickY = event.clientY || rect.top + rect.height / 2;

    playCardTapConfetti({
      clientX: clickX,
      clientY: clickY,
      elementWidth: rect.width,
      elementHeight: rect.height,
      characterColors: acquiredCharacter.characterColor,
    });

    setIsResultCardTapped(false);
    if (resultCardTapFrameRef.current !== null) {
      window.cancelAnimationFrame(resultCardTapFrameRef.current);
    }
    resultCardTapFrameRef.current = window.requestAnimationFrame(() => {
      setIsResultCardTapped(true);
      resultCardTapFrameRef.current = null;
    });

    if (resultCardTapResetTimerRef.current !== null) {
      window.clearTimeout(resultCardTapResetTimerRef.current);
    }
    resultCardTapResetTimerRef.current = window.setTimeout(() => {
      setIsResultCardTapped(false);
      resultCardTapResetTimerRef.current = null;
    }, 520);
  }, [wasSuccessful, acquiredCharacter]);

  useEffect(() => {
    if (!wasSuccessful) {
      return;
    }
    playAcquisitionConfetti(
      acquiredCharacter !== null
        ? { characterColors: acquiredCharacter.characterColor }
        : undefined,
    );
  }, [acquiredCharacter, wasSuccessful, result.id]);

  return (
    <main
      className={`flow-screen result-screen result-screen--registered result-screen--accent-${accentVariant}`}
      style={characterThemeVars}
    >
      <FlowBrand />

      <div className="result-registered-capture-root">
        <header className="result-registered-hero" aria-labelledby="registered-heading">
          <p className="result-registered-eyebrow">今日のピンアナゴ</p>
          <h1
            id="registered-heading"
            className={`result-registered-title ${wasSuccessful ? "" : "is-fail"}`}
          >
            {wasSuccessful ? "獲得" : "獲得ならず…"}
          </h1>
        </header>

        <div className="result-registered-card-block">
          <CharacterResultWhiteCard
            ref={shareCaptureRef}
            portraitMode={wasSuccessful ? "character" : "acquisition-fail"}
            character={displayCharacter}
            personalityTags={personalityTags}
            goodDurationLabel={formatDuration(result.goodMs)}
            goodRatioLabel={formatPercent(result.goodRatio)}
            acquiredAtLabel={formatAcquiredAt(result.endedAt)}
            measurementDurationLabel={formatDuration(result.activeMeasurementMs)}
            characterStory={
              !isTauriRuntime()
                ? null
                : wasSuccessful && displayCharacter !== null
                  ? displayCharacter.story
                  : "？？？？？？？？？"
            }
            articleClassName={`${
              wasSuccessful
                ? "result-registered-card--acquired"
                : "result-registered-card--acquisition-fail"
            } ${isResultCardEntering ? "is-entering" : ""} ${
              isResultCardTapped ? "is-tapped" : ""
            }`.trim()}
            articleStyle={shareCardThemeVars}
            onArticleClick={handleResultCardTap}
            onArticleMouseMove={wasSuccessful ? onResultCardMouseMove : undefined}
            onArticleMouseLeave={wasSuccessful ? onResultCardMouseLeave : undefined}
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
                void handleResultCapture("share");
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
                void handleResultCapture("copy");
              }}
            >
              <img src="/download.png" alt="" width={32} height={32} draggable={false} />
            </button>
          </div>
        </div>
      </div>

      <p
        className="result-registered-share-feedback"
        role="status"
        aria-live="polite"
      >
        {shareFeedback ?? ""}
      </p>

      <footer className="result-registered-footer">
        <button
          type="button"
          className={`result-registered-home ${wasSuccessful ? "is-acquired" : "is-miss"}`}
          onClick={onBackHome}
        >
          ホーム
        </button>
      </footer>
    </main>
  );
}
