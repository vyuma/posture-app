import { EMPTY_POSTURE_EXPERIMENT } from "./engine.spec";
import type {
  ExtractFeatureResult,
  LandmarkSelection,
  PickedPoint,
  Point3,
  PostureExperimentMetrics,
  PostureExperimentProxyPoint,
  PostureExperimentSourceQuality,
} from "./engine.types";
import { isFiniteNumber } from "./utils/math";
import {
  angleDegBetween2D,
  angleDegBetweenProjectedYZ,
  midpoint,
  subtract2D,
  subtract3D,
} from "./engine.pose.geometry";
import {
  areCorePointsFromWorld,
  buildCorePoints,
  isUsablePoint,
} from "./engine.pose.landmarks";

const VERTICAL_AXIS_3D = { x: 0, y: -1, z: 0 };

export function computeNeckAngle2D(
  nose: Point3,
  earMidpoint: Point3,
  torsoAxis: { x: number; y: number },
) {
  return angleDegBetween2D(subtract2D(nose, earMidpoint), torsoAxis);
}

export function computeNeckAngle3D(
  selected: LandmarkSelection,
  nose: Point3,
  earMidpoint: Point3,
  shoulderMidpoint: Point3,
) {
  if (!areCorePointsFromWorld(selected)) {
    return null;
  }

  const hipMidpoint =
    isWorldSourcePoint(selected.HL) && isWorldSourcePoint(selected.HR)
      ? midpoint(selected.HL!.point, selected.HR!.point)
      : null;
  const torsoAxis3D = hipMidpoint
    ? subtract3D(shoulderMidpoint, hipMidpoint)
    : VERTICAL_AXIS_3D;

  return angleDegBetweenProjectedYZ(
    subtract3D(nose, earMidpoint),
    torsoAxis3D,
  );
}

export function computeHeadForwardAngle3D(
  selected: LandmarkSelection,
  earMidpoint: Point3,
  shoulderMidpoint: Point3,
) {
  if (!areCorePointsFromWorld(selected)) {
    return null;
  }

  return angleDegBetweenProjectedYZ(
    subtract3D(earMidpoint, shoulderMidpoint),
    VERTICAL_AXIS_3D,
  );
}

export function computePostureExperiment(
  selected: LandmarkSelection,
  extracted: ExtractFeatureResult,
): PostureExperimentMetrics {
  const sourceQuality = getExperimentSourceQuality(
    selected,
    extracted.qualityOk,
  );

  if (!extracted.qualityOk) {
    return {
      ...EMPTY_POSTURE_EXPERIMENT,
      sourceQuality,
    };
  }

  if (!extracted.points3d || !areCorePointsFromWorld(selected)) {
    return {
      ...EMPTY_POSTURE_EXPERIMENT,
      neckAngle2dFallback: extracted.features.neckAngleDeg,
      sourceQuality,
    };
  }

  const { N, EL, ER, SL, SR } = extracted.points3d;
  const SM = midpoint(SL, SR);
  const EM = midpoint(EL, ER);

  const hipsFromWorld =
    isWorldSourcePoint(selected.HL) && isWorldSourcePoint(selected.HR);
  const HM = hipsFromWorld
    ? midpoint(selected.HL!.point, selected.HR!.point)
    : null;
  const neckAngle3d = computeNeckAngle3D(selected, N, EM, SM);
  const neckAngle2dFallback =
    neckAngle3d === null ? extracted.features.neckAngleDeg : null;

  return {
    neckAngle2dFallback,
    neckAngle3d,
    noseShoulderZDelta: finiteOrNull(N.z - SM.z),
    headForwardAngleDeg: extracted.features.headForwardAngleDeg,
    sourceQuality: hipsFromWorld ? sourceQuality : "vertical-fallback",
    proxy: {
      nose: toExperimentProxyPoint(N),
      earMidpoint: toExperimentProxyPoint(EM),
      shoulderMidpoint: toExperimentProxyPoint(SM),
      hipMidpoint: HM ? toExperimentProxyPoint(HM) : null,
    },
  };
}

function getExperimentSourceQuality(
  selected: LandmarkSelection,
  coreQualityOk: boolean,
): PostureExperimentSourceQuality {
  if (!coreQualityOk || buildCorePoints(selected) === null) {
    return "insufficient";
  }

  if (!isUsablePoint(selected.HL) || !isUsablePoint(selected.HR)) {
    return "missing-hips";
  }

  const sources = [
    selected.N,
    selected.EL,
    selected.ER,
    selected.SL,
    selected.SR,
    selected.HL,
    selected.HR,
  ].map((item) => item!.source);

  const uniqueSources = new Set(sources);
  if (uniqueSources.size > 1) {
    return "mixed";
  }

  return sources[0];
}

function isWorldSourcePoint(item: PickedPoint | null) {
  return isUsablePoint(item) && item!.source === "world";
}

function toExperimentProxyPoint(point: Point3): PostureExperimentProxyPoint {
  return {
    y: point.y,
    z: point.z,
    visibility: point.visibility,
  };
}

function finiteOrNull(value: number) {
  return isFiniteNumber(value) ? value : null;
}
