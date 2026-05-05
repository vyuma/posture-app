import { useEffect, useRef } from "react";

type UsePostureTransitionEffectsParams = {
  isBadPosture: boolean;
  onPostureChanged: (isBad: boolean) => Promise<void> | void;
  onRecovered: () => Promise<void> | void;
};

export function usePostureTransitionEffects({
  isBadPosture,
  onPostureChanged,
  onRecovered,
}: UsePostureTransitionEffectsParams) {
  const prevPostureStateRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (prevPostureStateRef.current === null) {
      prevPostureStateRef.current = isBadPosture;
      return;
    }

    const previous = prevPostureStateRef.current;
    if (previous === isBadPosture) {
      return;
    }

    prevPostureStateRef.current = isBadPosture;
    void onPostureChanged(isBadPosture);

    if (previous && !isBadPosture) {
      void onRecovered();
    }
  }, [isBadPosture, onPostureChanged, onRecovered]);
}
