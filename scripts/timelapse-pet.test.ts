import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { bindCanvasMattes } from '../src/features/timelapse/canvasMattes';

for (const version of ['widget-states-v2', 'expression-states-v1']) {
  test(`${version}: canvas stripes use the same silhouette as the live SVG widget`, () => {
    const original = JSON.parse(readFileSync(`public/animations/anago/normal-nago/${version}.json`, 'utf8'));
    const resolved = bindCanvasMattes(structuredClone(original));
    let checked = 0;
    resolved.layers.forEach((layer: { tt?: number; tp?: number }, index: number) => {
      if (!layer.tt) return;
      const silhouette = original.layers[index - 1];
      expect(silhouette.td).toBe(1);
      expect(layer.tp).toBe(silhouette.ind);
      checked++;
      delete layer.tp;
    });
    expect(checked).toBeGreaterThan(0);
    // Positions, shapes, frame ranges, easing and all original layers stay intact.
    expect(resolved).toEqual(original);
  });
}
test('explicit matte links are retained, including those in nested compositions', () => {
  const data = { layers: [{ ind: 7, td: 1 }, { ind: 5, tt: 1, tp: 19 }], assets: [{ layers: [{ ind: 30, td: 1 }, { ind: 10, tt: 1 }] }] };
  const resolved = bindCanvasMattes(data);
  expect(resolved.layers[1].tp).toBe(19);
  expect((resolved.assets[0].layers[1] as { tp?: number }).tp).toBe(30);
});
