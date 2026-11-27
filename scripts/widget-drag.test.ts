import feedback from '../src/features/posture/postureFeedback.json';
import translations from '../src/features/i18n/messages.json';
import { expect, test } from 'bun:test';
import { widgetBounds, clampWidgetPosition } from '../src/features/work/widgetPosition';
import { speechGeometry, speechLines, measureSpeechText, widgetGeometry, type WidgetPose } from '../src/features/work/widgetPresentation';

test('all poses, growth sizes and long dialogue stay reachable at viewport edges', () => {
  for (const [width, height] of [[1512,982],[720,512],[390,844],[320,568]]) {
    for (const pose of ['good','bad','rest','paused'] as WidgetPose[]) {
      for (const growth of [0,.5,1]) for (const text of Object.values(feedback).flatMap(ja => [ja, ...Object.values(translations[ja as keyof typeof translations])])) {
        const bounds = widgetBounds(pose, speechGeometry(widgetGeometry(pose, growth, height - 60, width), text));
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

test('speech keeps Figma type and vertical spacing, widens first, then wraps with 30px each side', () => {
  const text = 'Right shoulder higher! Reset your chin position!';
  const base = widgetGeometry('bad', 0, 922, 1512);
  const wide = speechGeometry(base, text);
  expect(wide.fontSize).toBe(13.2498); expect(wide.lineHeight).toBe(16); expect(wide.tracking).toBe(.691486);
  expect(wide.bubbleHeight).toBe(35); expect(speechLines(wide, text)).toHaveLength(1);
  expect(wide.bubbleWidth).toBeGreaterThan(base.bubbleWidth);
  const narrow = speechGeometry(widgetGeometry('bad', 0, 784, 320), text);
  const lines = speechLines(narrow, text);
  expect(lines.length).toBeGreaterThan(1); expect(lines.join(' ')).toBe(text);
  expect(narrow.fontSize).toBe(wide.fontSize); expect(narrow.lineHeight).toBe(wide.lineHeight);
  expect(narrow.bubbleHeight - lines.length*narrow.lineHeight).toBe(19);
  expect(narrow.bubbleTop + narrow.bubbleHeight).toBeCloseTo(wide.bubbleTop + wide.bubbleHeight, 5);
  for (const line of lines) expect((narrow.bubbleWidth-measureSpeechText(line,narrow.fontSize,narrow.tracking))/2).toBeGreaterThanOrEqual(29.99);
  expect(narrow.bubbleLeft + narrow.bubbleWidth/2).toBeCloseTo(base.bubbleLeft + base.bubbleWidth/2, 5);
});
