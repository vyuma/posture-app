import type { WidgetPose } from './widgetPresentation';
import { widgetGeometry } from './widgetPresentation';
export type Point = { x: number; y: number };
export type Viewport = { width: number; height: number };
export type WidgetBounds = { left: number; top: number; right: number; bottom: number };

/** Bounds relative to the timer bar, including the tilted speech bubble and shadow. */
export function widgetBounds(pose: WidgetPose, g: ReturnType<typeof widgetGeometry>): WidgetBounds {
  const angle = (g.bubbleAngle + 1.5) * Math.PI / 180;
  const extraX = (Math.abs(g.bubbleWidth * Math.cos(angle)) + Math.abs(g.bubbleHeight * Math.sin(angle)) - g.bubbleWidth) / 2;
  const extraY = (Math.abs(g.bubbleWidth * Math.sin(angle)) + Math.abs(g.bubbleHeight * Math.cos(angle)) - g.bubbleHeight) / 2;
  const shadowSide = 24 * g.growth;
  const shadowBottom = 3.4049 + 9.4946 * g.growth + 3 * (6.8098 + 18.9891 * g.growth);
  return {
    left: Math.min(0, pose === 'rest' ? -60 : g.maskLeft - shadowSide, g.bubbleLeft - extraX - 12),
    top: Math.min(g.maskTop, g.bubbleTop - extraY - 12),
    right: Math.max(186, pose === 'rest' ? 178 : g.maskLeft + g.maskWidth + shadowSide, g.bubbleLeft + g.bubbleWidth + extraX + 12),
    bottom: Math.max(75, g.maskTop + g.maskHeight + shadowBottom),
  };
}
export function clampWidgetPosition(p: Point, viewport: Viewport, bounds: WidgetBounds): Point {
  const inset = 8;
  return {
    x: Math.min(viewport.width - inset - bounds.right, Math.max(inset - bounds.left, p.x)),
    y: Math.min(viewport.height - inset - bounds.bottom, Math.max(inset - bounds.top, p.y)),
  };
}
