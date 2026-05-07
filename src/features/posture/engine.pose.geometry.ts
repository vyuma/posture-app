import type {
  BodyTurnSource,
  LandmarkSelection,
  PickedPoint,
  Point3,
} from "./engine.types";
import { clamp, isFiniteNumber, normalizeVector2D } from "./utils/math";
import { isUsablePoint } from "./engine.pose.landmarks";

const DEG_PER_RAD = 180 / Math.PI;
const VERTICAL_AXIS = { x: 0, y: -1 };

export function midpoint(a: Point3, b: Point3): Point3 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

export function subtract2D(a: Pick<Point3, "x" | "y">, b: Pick<Point3, "x" | "y">) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

export function subtract3D(a: Point3, b: Point3) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

export function dot2D(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

export function distance2D(
  a: Pick<Point3, "x" | "y">,
  b: Pick<Point3, "x" | "y">,
) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angleDegBetween2D(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const na = normalizeVector2D(a);
  const nb = normalizeVector2D(b);

  if (!na || !nb) {
    return NaN;
  }

  const cosine = clamp(dot2D(na, nb), -1, 1);
  return Math.acos(cosine) * DEG_PER_RAD;
}

export function angleDegBetweenProjectedYZ(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) {
  const lengthA = Math.hypot(a.y, a.z);
  const lengthB = Math.hypot(b.y, b.z);
  if (
    !isFiniteNumber(lengthA) ||
    !isFiniteNumber(lengthB) ||
    lengthA < 1e-6 ||
    lengthB < 1e-6
  ) {
    return null;
  }

  const delta = Math.atan2(a.z, a.y) - Math.atan2(b.z, b.y);
  return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) * DEG_PER_RAD;
}

export function buildTorsoAxis(
  selected: LandmarkSelection,
  shoulderMidpoint: Point3,
  source: BodyTurnSource,
) {
  const hipsUsable =
    isSourceUsablePoint(selected.HL, source) &&
    isSourceUsablePoint(selected.HR, source);
  if (!hipsUsable) {
    return VERTICAL_AXIS;
  }

  const hipMidpoint = midpoint(selected.HL!.point, selected.HR!.point);
  return normalizeVector2D(subtract2D(shoulderMidpoint, hipMidpoint)) ?? VERTICAL_AXIS;
}

function isSourceUsablePoint(item: PickedPoint | null, source: BodyTurnSource) {
  return isUsablePoint(item) && item!.source === source;
}
