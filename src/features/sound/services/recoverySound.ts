import { DEFAULT_SOUND_SETTINGS } from "../types/soundSettings";

type RecoverySoundConfig = {
  enabled: boolean;
  src: string;
  volume: number;
};

let audio: HTMLAudioElement | null = null;
const activePlaybackAudios = new Set<HTMLAudioElement>();
/** 効果音プレビュー専用：直近を止めてから再生（enabled に依存しない） */
let previewAudio: HTMLAudioElement | null = null;
let config: RecoverySoundConfig = {
  enabled: true,
  src: DEFAULT_SOUND_SETTINGS.selectedSound,
  volume: 0.7,
};

function ensureAudioElement() {
  if (!config.src) {
    return null;
  }

  if (!audio) {
    audio = new Audio(config.src);
    audio.preload = "auto";
  }

  if (audio.src !== new URL(config.src, window.location.origin).href) {
    audio.src = config.src;
    audio.load();
  }

  audio.volume = Math.max(0, Math.min(1, config.volume));

  return audio;
}

function createPlaybackAudioElement() {
  if (!config.src) {
    return null;
  }

  const target = new Audio(config.src);
  target.preload = "auto";
  target.volume = Math.max(0, Math.min(1, config.volume));
  const cleanup = () => {
    activePlaybackAudios.delete(target);
  };
  target.addEventListener("ended", cleanup, { once: true });
  target.addEventListener("error", cleanup, { once: true });
  activePlaybackAudios.add(target);
  return target;
}

export function configureRecoverySound(next: Partial<RecoverySoundConfig>) {
  config = {
    ...config,
    ...next,
    volume:
      typeof next.volume === "number"
        ? Math.max(0, Math.min(1, next.volume))
        : config.volume,
  };

  ensureAudioElement();
}

export async function primeRecoverySound() {
  try {
    const target = ensureAudioElement();
    if (!target) {
      return;
    }
    target.load();
  } catch {
    // ignore preload failures
  }
}

export async function playRecoverySound() {
  if (!config.enabled || !config.src) {
    return;
  }

  let target: HTMLAudioElement | null = null;
  try {
    ensureAudioElement();
    target = createPlaybackAudioElement();
    if (!target) {
      return;
    }
    await target.play();
  } catch {
    if (target) {
      activePlaybackAudios.delete(target);
    }
    // ignore play failures (autoplay policy, interruption)
  }
}

/** 音量・種類の試聴用。recovery の enabled / config に関係なく再生（ストレージ未保存のドラフトにも使える）。 */
export async function playSoundPreview(payload: {
  src: string;
  volume: number;
}) {
  const src = payload.src.trim();
  if (!src || typeof window === "undefined") {
    return;
  }

  const volume = Math.max(0, Math.min(1, payload.volume));

  try {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.src = "";
      previewAudio.removeAttribute("src");
      previewAudio.load();
    }

    previewAudio = new Audio(src);
    previewAudio.preload = "auto";
    previewAudio.volume = volume;
    void previewAudio.play();
  } catch {
    previewAudio = null;
  }
}
