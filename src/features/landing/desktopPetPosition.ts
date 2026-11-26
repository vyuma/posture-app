import type { Point, WidgetBounds } from '../work/widgetPosition';
export const DESKTOP_PET_SCALE = 97 / 178;
export const DESKTOP_SURFACE = { width: 577.622, height: 361.449, menuBottom: 28, dockTop: 318.449 };

/** The entire pet (speech and shadow included) stays above the illustrated Dock. */
export function clampDesktopPet(point: Point, bounds: WidgetBounds): Point {
  const s = DESKTOP_PET_SCALE, inset = 4;
  return {
    x: Math.max(inset - bounds.left * s, Math.min(DESKTOP_SURFACE.width - inset - bounds.right * s, point.x)),
    y: Math.max(DESKTOP_SURFACE.menuBottom + inset - bounds.top * s, Math.min(DESKTOP_SURFACE.dockTop - inset - bounds.bottom * s, point.y)),
  };
}
