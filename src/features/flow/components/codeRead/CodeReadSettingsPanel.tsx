import { useEffect, useMemo, useRef } from "react";

import { playSoundPreview } from "../../../sound/services/recoverySound";
import { BUILTIN_SOUND_OPTIONS } from "../../../sound/types/soundSettings";
import type { SoundSettings } from "../../../sound/types/soundSettings";
import { buildFrame53SoundLabel } from "../shared/soundLabels";

export type CodeReadSettingsPanelProps = {
  /** アクセシビリティ用 id の接頭辞（同一画面に複数置く場合にずらす） */
  idPrefix?: string;
  soundSettings: SoundSettings;
  onSoundSettingsChange: (next: SoundSettings) => void;
  isCharacterOverlayEnabled: boolean;
  onCharacterOverlayEnabledChange: (enabled: boolean) => void;
};

export function CodeReadSettingsPanel({
  idPrefix = "frame53",
  soundSettings,
  onSoundSettingsChange,
  isCharacterOverlayEnabled,
  onCharacterOverlayEnabledChange,
}: CodeReadSettingsPanelProps) {
  const volumePreviewTimerRef = useRef<number | null>(null);

  function scheduleSoundVolumePreview(volume: number, selectedSrc: string) {
    if (volumePreviewTimerRef.current !== null) {
      clearTimeout(volumePreviewTimerRef.current);
    }
    volumePreviewTimerRef.current = window.setTimeout(() => {
      volumePreviewTimerRef.current = null;
      void playSoundPreview({ src: selectedSrc, volume });
    }, 220);
  }

  useEffect(() => {
    return () => {
      if (volumePreviewTimerRef.current !== null) {
        clearTimeout(volumePreviewTimerRef.current);
      }
    };
  }, []);

  const soundOptionList = useMemo(() => {
    return Array.from(
      new Set([...BUILTIN_SOUND_OPTIONS, ...soundSettings.customSounds]),
    );
  }, [soundSettings.customSounds]);

  const pinLabelId = `${idPrefix}-switch-pin-label`;
  const soundLabelId = `${idPrefix}-switch-sound-label`;
  const volumeInputId = `${idPrefix}-volume`;

  return (
    <>
      <div className="frame53-toggle-strip">
        <span id={pinLabelId} className="frame53-toggle-strip-label">
          ピンアナゴ表示
        </span>
        <button
          type="button"
          className={`frame53-toggle-strip-switch ${isCharacterOverlayEnabled ? "is-on" : ""}`}
          role="switch"
          aria-checked={isCharacterOverlayEnabled}
          aria-labelledby={pinLabelId}
          onClick={() =>
            onCharacterOverlayEnabledChange(!isCharacterOverlayEnabled)
          }
        >
          <span
            className="frame53-toggle-strip-switch-knob"
            aria-hidden
          />
        </button>
      </div>
      <div className="frame53-toggle-strip">
        <span id={soundLabelId} className="frame53-toggle-strip-label">
          サウンド
        </span>
        <button
          type="button"
          className={`frame53-toggle-strip-switch ${soundSettings.enabled ? "is-on" : ""}`}
          role="switch"
          aria-checked={soundSettings.enabled}
          aria-labelledby={soundLabelId}
          onClick={() =>
            onSoundSettingsChange({
              ...soundSettings,
              enabled: !soundSettings.enabled,
            })
          }
        >
          <span
            className="frame53-toggle-strip-switch-knob"
            aria-hidden
          />
        </button>
      </div>

      <div
        className={`frame53-sound-card ${!soundSettings.enabled ? "frame53-muted" : ""}`}
      >
        <label className="frame53-volume-row" htmlFor={volumeInputId}>
          <span className="frame53-volume-visible-label">音量</span>
          <input
            id={volumeInputId}
            className="frame53-volume-range"
            type="range"
            min={0}
            max={100}
            value={Math.round(soundSettings.volume * 100)}
            style={{
              ["--frame53-volume-pct" as string]: `${Math.round(soundSettings.volume * 100)}%`,
            }}
            onChange={(e) => {
              const volume = Number(e.target.value) / 100;
              onSoundSettingsChange({
                ...soundSettings,
                volume,
              });
              scheduleSoundVolumePreview(volume, soundSettings.selectedSound);
            }}
          />
        </label>
        <p className="frame53-sfx-label">効果音</p>
        <div className="frame53-sfx-shell">
          <select
            className="frame53-sfx-select"
            aria-label="効果音の種類"
            value={soundSettings.selectedSound}
            onChange={(e) => {
              const selectedSound = e.target.value;
              onSoundSettingsChange({
                ...soundSettings,
                selectedSound,
              });
              void playSoundPreview({
                src: selectedSound,
                volume: soundSettings.volume,
              });
            }}
          >
            {soundOptionList.map((option) => (
              <option key={option} value={option}>
                {buildFrame53SoundLabel(option)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
