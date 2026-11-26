import { test, expect } from 'bun:test';
import { clampDesktopPet, DESKTOP_PET_SCALE as scale, DESKTOP_SURFACE as surface } from '../src/features/landing/desktopPetPosition';
import { widgetBounds } from '../src/features/work/widgetPosition';
import { speechGeometry, widgetGeometry } from '../src/features/work/widgetPresentation';

for (const growth of [0, .2, 1]) {
  test(`laptop pet including speech and shadow stays above Dock at growth ${growth}`, () => {
    const bounds = widgetBounds('bad', speechGeometry(widgetGeometry('bad', growth, 470), '姿勢を戻して！'));
    for (const point of [{ x: -10000, y: -10000 }, { x: 10000, y: 10000 }, { x: 375, y: 238.58 }]) {
      const position = clampDesktopPet(point, bounds);
      expect(position.x + bounds.left * scale).toBeGreaterThanOrEqual(3.99);
      expect(position.x + bounds.right * scale).toBeLessThanOrEqual(surface.width - 3.99);
      expect(position.y + bounds.top * scale).toBeGreaterThanOrEqual(surface.menuBottom + 3.99);
      expect(position.y + bounds.bottom * scale).toBeLessThanOrEqual(surface.dockTop - 3.99);
    }
  });
}
