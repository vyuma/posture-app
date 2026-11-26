import { expect, test } from 'bun:test';
import { widgetBounds, clampWidgetPosition } from '../src/features/work/widgetPosition';
import { speechGeometry, widgetGeometry, type WidgetPose } from '../src/features/work/widgetPresentation';

test('all poses, growth sizes and long dialogue stay reachable at viewport edges', () => {
  for (const [width, height] of [[1512,982],[720,512],[390,844],[320,568]]) {
    for (const pose of ['good','bad','rest','paused'] as WidgetPose[]) {
      for (const growth of [0,.5,1]) {
        const bounds = widgetBounds(pose, speechGeometry(widgetGeometry(pose, growth, height - 60), '頭が前に出てるよ！'));
        for (const [x,y] of [[-10000,-10000],[10000,10000],[width/2,height/2]]) {
          const p = clampWidgetPosition({x,y}, {width,height}, bounds);
          expect(p.x + bounds.left).toBeGreaterThanOrEqual(7.99);
          expect(p.x + bounds.right).toBeLessThanOrEqual(width - 7.99);
          expect(p.y + bounds.top).toBeGreaterThanOrEqual(7.99);
          expect(p.y + bounds.bottom).toBeLessThanOrEqual(height - 7.99);
        }
      }
    }
  }
});
test('window shrink reclamps an existing position without changing pet geometry', () => {
  const geometry = widgetGeometry('bad', 1, 492), before = {...geometry};
  const bounds = widgetBounds('bad', geometry);
  const p = clampWidgetPosition({ x: 1200, y: 850 }, { width:720, height:512 }, bounds);
  expect(p.x + bounds.right).toBeLessThanOrEqual(712);
  expect(p.y + bounds.bottom).toBeLessThanOrEqual(504);
  expect(geometry).toEqual(before);
});
