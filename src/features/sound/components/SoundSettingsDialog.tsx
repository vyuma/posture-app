import { useEffect, useMemo, useState } from "react";

import {
  BUILTIN_SOUND_OPTIONS,
  type SoundSettings,
} from "../types/soundSettings";
import "./SoundSettingsDialog.css";

type SoundSettingsDialogProps = {
  settings: SoundSettings;
  onChange: (settings: SoundSettings) => void;
  onClose: () => void;
  onPreview: () => void;
};

function buildSoundLabel(path: string) {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.mp3$|\.wav$/i, "");
}

export function SoundSettingsDialog({
  settings,
  onChange,
  onClose,
  onPreview,
}: SoundSettingsDialogProps) {
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const options = useMemo(() => {
    const merged = [...BUILTIN_SOUND_OPTIONS, ...settings.customSounds];
    return Array.from(new Set(merged));
  }, [settings.customSounds]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setUploadError("");

    if (!file) {
      return;
    }

    const isSupported = /audio\/(mpeg|wav|x-wav|mp3)/i.test(file.type);
    if (!isSupported) {
      setUploadError("mp3 または wav ファイルのみアップロードできます。");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });

      if (!dataUrl.startsWith("data:audio/")) {
        throw new Error("invalid data url");
      }

      const nextCustomSounds = [dataUrl, ...settings.customSounds].slice(0, 10);
      onChange({
        ...settings,
        customSounds: nextCustomSounds,
        selectedSound: dataUrl,
      });
    } catch {
      setUploadError("オーディオファイルの読み込みに失敗しました。");
    }
  };

  return (
    <div className="sound-overlay" onClick={onClose} role="presentation">
      <section
        className="sound-dialog"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-label="サウンド設定"
      >
        <div className="sound-dialog-header">
          <div>
            <p className="sound-eyebrow">通知サウンド</p>
            <h2>サウンド設定</h2>
          </div>
          <button type="button" className="sound-close" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="sound-body">
          <label className="sound-field sound-toggle">
            <span>効果音を有効化</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) =>
                onChange({
                  ...settings,
                  enabled: event.currentTarget.checked,
                })
              }
            />
          </label>

          <label className="sound-field" htmlFor="sound-volume">
            <span>音量 ({Math.round(settings.volume * 100)}%)</span>
            <input
              id="sound-volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(event) =>
                onChange({
                  ...settings,
                  volume: Number(event.currentTarget.value) / 100,
                })
              }
            />
          </label>

          <label className="sound-field" htmlFor="sound-select">
            <span>効果音を選択</span>
            <select
              id="sound-select"
              value={settings.selectedSound}
              onChange={(event) =>
                onChange({
                  ...settings,
                  selectedSound: event.currentTarget.value,
                })
              }
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {buildSoundLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="sound-field" htmlFor="sound-upload">
            <span>サウンドを追加 (mp3/wav)</span>
            <input id="sound-upload" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={handleUpload} />
          </label>

          {uploadError ? <p className="sound-error">{uploadError}</p> : null}

          <div className="sound-actions">
            <button type="button" onClick={onPreview}>
              試聴
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
