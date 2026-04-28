import { useEffect, useRef } from "react";

import recoverySoundUrl from "../assets/good-posture.mp3";

export function usePostureRecoverySound(isBadPosture: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousIsBadPostureRef = useRef(isBadPosture);

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }

    const audio = new Audio(recoverySoundUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (previousIsBadPostureRef.current && !isBadPosture) {
      const audio = audioRef.current;

      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }

    previousIsBadPostureRef.current = isBadPosture;
  }, [isBadPosture]);
}