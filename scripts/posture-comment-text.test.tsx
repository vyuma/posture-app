import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PostureCommentText } from '../src/features/work/PostureCommentText';

const browser = new Window();
const fonts = new browser.EventTarget();
Object.assign(fonts, { ready: Promise.resolve() });
Object.defineProperty(browser.document, 'fonts', { value: fonts });
let resize: ResizeObserverCallback, disconnected = false;
Object.assign(globalThis, {
  window: browser, document: browser.document, IS_REACT_ACT_ENVIRONMENT: true,
  getComputedStyle: () => ({ fontSize: '14px' }),
  ResizeObserver: class {
    constructor(callback: ResizeObserverCallback) { resize = callback; disconnected = false; }
    observe() {}
    disconnect() { disconnected = true; }
  },
});
Object.defineProperty(browser.HTMLElement.prototype, 'clientWidth', { get: () => 310 });
let fits = (_size: number, _tracking: number) => true;
const attempts: Array<[number, number]> = [];
Object.defineProperty(browser.HTMLElement.prototype, 'getClientRects', { value: function(this: HTMLElement) {
  const size = parseFloat(this.style.fontSize), tracking = parseFloat(this.style.letterSpacing);
  attempts.push([size, tracking]);
  return Array(fits(size, tracking) ? 2 : 3).fill({});
} });
const host = document.createElement('div'); document.body.append(host);
let root = createRoot(host);
async function render(text = '今日は右肩が上がりがちだったね。肩こりにつながりやすいから、明日は左右の肩の高さをそろえてみよう！') {
  await act(() => root.render(<PostureCommentText>{text}</PostureCommentText>));
  return host.querySelector('span')!;
}
afterEach(async () => {
  await act(() => root.unmount()); root = createRoot(host);
  attempts.length = 0; fits = () => true;
});

test('keeps readable default type when removing the forced break is enough', async () => {
  const span = await render();
  expect(host.querySelector('br')).toBeNull();
  expect(span.textContent).toContain('だったね。肩こり');
  expect(span.style.fontSize).toBe('14px');
  expect(parseFloat(span.style.letterSpacing)).toBe(0);
  expect(attempts.every(([size, tracking]) => size === 14 && tracking === 0)).toBe(true);
});

test('tries minus ten percent tracking before making any letters smaller', async () => {
  fits = (_size, tracking) => tracking === -.1;
  const span = await render();
  expect(span.style.fontSize).toBe('14px');
  expect(span.style.letterSpacing).toBe('-0.1em');
  expect(attempts.slice(0, 2)).toEqual([[14, 0], [14, -.1]]);
});

test('shrinks only as far as needed, and refits on width, font and text changes', async () => {
  fits = (size, tracking) => tracking === -.1 && size <= 9.5;
  const span = await render();
  expect(span.style.fontSize).toBe('9.5px');
  expect(attempts.slice(0, 3)).toEqual([[14, 0], [14, -.1], [13.75, -.1]]);
  fits = () => true;
  await act(() => resize([{ contentRect: { width: 600 } }] as ResizeObserverEntry[], {} as ResizeObserver));
  expect(span.style.fontSize).toBe('14px');
  expect(parseFloat(span.style.letterSpacing)).toBe(0);
  fits = (_size, tracking) => tracking === -.1;
  await act(() => fonts.dispatchEvent(new browser.Event('loadingdone')));
  expect(span.style.letterSpacing).toBe('-0.1em');
  fits = () => true;
  await render('Short translated feedback.');
  expect(parseFloat(span.style.letterSpacing)).toBe(0);
  await act(() => root.render(null));
  expect(disconnected).toBe(true);
  const count = attempts.length;
  fonts.dispatchEvent(new browser.Event('loadingdone'));
  browser.dispatchEvent(new browser.Event('resize'));
  expect(attempts.length).toBe(count);
});
