import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
const browser = new Window({ url: 'https://example.test/app' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, location: browser.location,
  innerWidth: 1512, innerHeight: 982, matchMedia: browser.matchMedia.bind(browser), IS_REACT_ACT_ENVIRONMENT: true });
mock.module('../src/features/work/WidgetPetRig', () => ({ WidgetPetRig: () => <div data-pet /> }));
mock.module('../src/features/work/WidgetTimerText', () => ({ WidgetTimerText: ({time}: {time:string}) => <b>{time}</b> }));
const { Widget } = await import('../src/features/work/Widget');
const host = document.createElement('div'); document.body.append(host); let root = createRoot(host);
const state = { sessionId: 'click-test', remainingMs: 60000, durationMs: 120000, phase: 'focus' as const, paused: false, bad: false, badSince: null, cycle: 1, cycles: 2 };
const actions: string[] = []; let drags = 0;
afterEach(async () => { await act(() => root.unmount()); root = createRoot(host); actions.length = 0; drags = 0; });
async function render(native = false) {
  await act(() => root.render(<Widget state={state} native={native} onAction={a => actions.push(a)} onDrag={() => drags++} />));
  const pet = host.querySelector<HTMLDivElement>('.work-widget-character')!;
  let captured = false;
  pet.setPointerCapture = () => { captured = true; }; pet.hasPointerCapture = () => captured; pet.releasePointerCapture = () => { captured = false; };
  return pet;
}
async function pointer(target: Element, type: string, x = 500, y = 500, button = 0) {
  await act(() => target.dispatchEvent(new browser.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button, clientX: x, clientY: y }) as unknown as Event));
}
test('pet click, bubble click, keyboard and bar background open once; controls keep their own actions', async () => {
  const pet = await render();
  for (const target of [host.querySelector('[data-pet]')!, host.querySelector('.work-widget-speech')!]) {
    await pointer(target, 'pointerdown'); await pointer(pet, 'pointerup');
  }
  await act(() => pet.click());
  await act(() => pet.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }) as unknown as Event));
  for (const selector of ['.work-widget-bar', 'progress', '.work-widget-time', '.work-widget-toggle', '.work-widget-stop']) {
    await act(() => host.querySelector<HTMLElement>(selector)!.click());
  }
  expect(actions).toEqual(['open','open','open','open','open','open','open','pause','finish']);
});
test('drag, cancelled gesture and secondary click never open the main window', async () => {
  const pet = await render(); const before = host.querySelector<HTMLElement>('aside')!.style.left;
  await pointer(pet,'pointerdown'); await pointer(pet,'pointermove',450,450); await pointer(pet,'pointermove'); await pointer(pet,'pointerup');
  expect(actions).toEqual([]);
  await pointer(pet,'pointerdown'); await pointer(pet,'pointermove',450,450); await pointer(pet,'pointercancel'); await pointer(pet,'pointerup');
  expect(host.querySelector<HTMLElement>('aside')!.style.left).toBe(before);
  await pointer(pet,'pointerdown',500,500,2); await pointer(pet,'pointerup',500,500,2);
  expect(actions).toEqual([]); expect(drags).toBe(0);
});
test('native pet waits for movement before OS drag and does not open on drag completion', async () => {
  const pet = await render(true);
  await pointer(pet,'pointerdown'); await pointer(pet,'pointermove',502,500); await pointer(pet,'pointerup',502,500);
  expect(actions).toEqual(['open']); expect(drags).toBe(0); actions.length = 0;
  await pointer(pet,'pointerdown'); await pointer(pet,'pointermove',510,500); await pointer(pet,'pointerup',510,500);
  expect(drags).toBe(1); expect(actions).toEqual([]);
  await pointer(pet,'pointerdown'); await act(() => browser.dispatchEvent(new browser.Event('blur'))); await pointer(pet,'pointerup');
  expect(actions).toEqual([]);
  await pointer(pet,'pointerdown'); await pointer(pet,'pointerup'); expect(actions).toEqual(['open']);
});
