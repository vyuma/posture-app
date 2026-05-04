import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";

import { POSE_LANDMARK_INDEX } from "./constants";
import { POSTURE_SPEC } from "./engine.spec";
import type {
  BodyTurnSource,
  ExtractedPoints,
  LandmarkSelection,
  PickedPoint,
} from "./engine.types";
import { isFiniteNumber } from "./utils/math";

export function pickLandmarkSet(
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
): LandmarkSelection {
  return buildLandmarkSelection((index) =>
    pickPoint(index, landmarks, worldLandmarks),
  );
}

export function pickLandmarkSetFromSource(
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
  source: BodyTurnSource,
): LandmarkSelection {
  return buildLandmarkSelection((index) =>
    pickPoint(index, landmarks, worldLandmarks, source),
  );
}

export function buildCorePoints(selected: LandmarkSelection): ExtractedPoints | null {
  if (!hasRequiredCorePoints(selected)) {
    return null;
  }

  return {
    N: selected.N!.point,
    EL: selected.EL!.point,
    ER: selected.ER!.point,
    SL: selected.SL!.point,
    SR: selected.SR!.point,
  };
}

export function areCorePointsFromWorld(selected: LandmarkSelection) {
  return (
    isWorldUsablePoint(selected.N) &&
    isWorldUsablePoint(selected.EL) &&
    isWorldUsablePoint(selected.ER) &&
    isWorldUsablePoint(selected.SL) &&
    isWorldUsablePoint(selected.SR)
  );
}

export function isUsablePoint(item: PickedPoint | null): item is PickedPoint {
  return item !== null && item.point.visibility >= POSTURE_SPEC.visibilityThreshold;
}

function buildLandmarkSelection(
  picker: (index: number) => PickedPoint | null,
): LandmarkSelection {
  return {
    N: picker(POSE_LANDMARK_INDEX.NOSE),
    EL: picker(POSE_LANDMARK_INDEX.LEFT_EAR),
    ER: picker(POSE_LANDMARK_INDEX.RIGHT_EAR),
    SL: picker(POSE_LANDMARK_INDEX.LEFT_SHOULDER),
    SR: picker(POSE_LANDMARK_INDEX.RIGHT_SHOULDER),
    HL: picker(POSE_LANDMARK_INDEX.LEFT_HIP),
    HR: picker(POSE_LANDMARK_INDEX.RIGHT_HIP),
  };
}

function hasRequiredCorePoints(selected: LandmarkSelection) {
  return (
    isUsablePoint(selected.N) &&
    isUsablePoint(selected.EL) &&
    isUsablePoint(selected.ER) &&
    isUsablePoint(selected.SL) &&
    isUsablePoint(selected.SR)
  );
}

function isWorldUsablePoint(item: PickedPoint | null) {
  return isUsablePoint(item) && item!.source === "world";
}

function pickPoint(
  index: number,
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[] | null,
  preferredSource?: BodyTurnSource,
): PickedPoint | null {
  const toPickedPoint = (
    source: BodyTurnSource,
    point: Landmark | NormalizedLandmark | null | undefined,
  ): PickedPoint | null => {
    if (!point || !isFinitePoint(point)) {
      return null;
    }

    return {
      point: {
        x: point.x,
        y: point.y,
        z: point.z,
        visibility: point.visibility,
      },
      source,
    };
  };

  const worldPicked = toPickedPoint("world", worldLandmarks?.[index]);
  const imagePicked = toPickedPoint("image", landmarks?.[index]);

  if (preferredSource === "world") {
    return worldPicked;
  }
  if (preferredSource === "image") {
    return imagePicked;
  }

  if (worldPicked) {
    return worldPicked;
  }
  if (imagePicked) {
    return imagePicked;
  }
  return null;
}

function isFinitePoint(point: { x: number; y: number; z: number; visibility: number }) {
  return (
    isFiniteNumber(point.x) &&
    isFiniteNumber(point.y) &&
    isFiniteNumber(point.z) &&
    isFiniteNumber(point.visibility)
  );
}
