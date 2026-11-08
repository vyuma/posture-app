import { expect, test } from 'bun:test';
import { timelapsePetLayout } from '../src/features/timelapse/petLayout';
import { speechGeometry, widgetGeometry, type WidgetPose } from '../src/features/work/widgetPresentation';
import { widgetBounds } from '../src/features/work/widgetPosition';
import messages from '../src/features/posture/postureFeedback.json';
import { paintWidgetTimer, type WidgetControlArt } from '../src/features/work/paintWidget';

test('placement reserves full growth, speech and shadows at every video edge and size', () => {
  for (const [width, height] of [[1280,720],[1920,1080],[720,1280],[640,480]]) {
    for (const [rw, rh] of [[.24,.6],[.12,.12],[.8,.9],[1,1]]) {
      for (const [x,y] of [[0,0],[1-rw,0],[0,1-rh],[1-rw,1-rh]]) {
        const box = { x:x*width, y:y*height, width:rw*width, height:rh*height };
        const layout = timelapsePetLayout(box);
        expect(widgetGeometry('bad',1,layout.availableHeight).growth).toBe(1);
        for (const pose of ['good','bad','rest','paused'] as WidgetPose[]) for (const growth of [0,.2,.5,.8,1]) for (const text of Object.values(messages)) {
          const bounds = widgetBounds(pose, speechGeometry(widgetGeometry(pose,growth,layout.availableHeight),text));
          expect(layout.x + bounds.left*layout.scale).toBeGreaterThanOrEqual(box.x);
          expect(layout.y + bounds.top*layout.scale).toBeGreaterThanOrEqual(box.y);
          expect(layout.x + bounds.right*layout.scale).toBeLessThanOrEqual(box.x+box.width);
          expect(layout.y + bounds.bottom*layout.scale).toBeLessThanOrEqual(box.y+box.height);
        }
      }
    }
  }
});

test('resizing the placement scales the resting pet and maximum growth together', () => {
  const small=timelapsePetLayout({x:0,y:0,width:120,height:300});
  const large=timelapsePetLayout({x:0,y:0,width:240,height:600});
  expect(large.scale).toBeCloseTo(small.scale*2);
  expect(widgetGeometry('bad',1,small.availableHeight).growth).toBe(1);
  expect(large.availableHeight).toBe(small.availableHeight);
});

test('small timer shadows shrink with the drawing instead of escaping the placement', () => {
  for (const scale of [.1,.5,1,2]) {
    const values: Record<string, unknown> = { getTransform: () => ({a:scale,b:0,c:0,d:scale}) };
    const context = new Proxy(values, { get: (target,key) => target[String(key)] ?? (() => {}) }) as unknown as CanvasRenderingContext2D;
    paintWidgetTimer(context,'good',1_500_000,1_500_000,{} as WidgetControlArt);
    expect(values.shadowOffsetX).toBe(4*scale);
    expect(values.shadowOffsetY).toBe(6*scale);
    expect(values.shadowBlur).toBe(4*scale);
  }
});
