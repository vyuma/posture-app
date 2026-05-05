type RecoverySoundConfig = {
  enabled: boolean;
  src: string;
  volume: number;
};

let audio: HTMLAudioElement | null = null;
const activePlaybackAudios = new Set<HTMLAudioElement>();
let config: RecoverySoundConfig = {
  enabled: true,
  src: "/sounds/freesound_community-correct-2-46134.mp3",
  volume: 0.7,
};

function ensureAudioElement() {
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
    target.load();
  } catch {
    // ignore preload failures
  }
}

export async function playRecoverySound() {
  if (!config.enabled) {
    return;
  }

  let target: HTMLAudioElement | null = null;
  try {
    ensureAudioElement();
    target = createPlaybackAudioElement();
    await target.play();
  } catch {
    if (target) {
      activePlaybackAudios.delete(target);
    }
    // ignore play failures (autoplay policy, interruption)
  }
}
