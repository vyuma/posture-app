import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createSession, type Baseline } from '../src/features/work/model';

const browser = new Window({ url: 'https://example.test/app' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, location: browser.location, Element: browser.Element, IS_REACT_ACT_ENVIRONMENT: true });
const originalTimers = { clearTimeout: globalThis.clearTimeout, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
afterAll(() => Object.assign(globalThis, originalTimers));
let now = 0, nextId = 0;
const pending = new Map<number, { at: number; run: () => void }>();
const schedule = (run: () => void, delay = 0) => { const id = ++nextId; pending.set(id, { at: now + delay, run }); return id; };
const cancel = (id: number) => { pending.delete(id); };
Object.assign(browser, { setTimeout: schedule, clearTimeout: cancel });
Object.assign(globalThis, { requestAnimationFrame: (run: FrameRequestCallback) => schedule(() => run(now), 16), cancelAnimationFrame: cancel, clearTimeout: cancel });
async function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const next = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
    if (!next || next[1].at > end) break;
    now = next[1].at; pending.delete(next[0]); await act(() => next[1].run());
  }
  now = end;
}
const launches: string[] = []; let taps = 0, stops = 0;
mock.module('../src/lib/playAcquisitionConfetti', () => ({ playAcquisitionConfetti: () => { launches.push('normal'); return () => { stops++; }; }, playCardTapConfetti: () => { taps++; } }));
mock.module('../src/lib/playRarityAcquisitionConfetti', () => ({ playRarityAcquisitionConfetti: (effect: string) => { launches.push(effect); return () => { stops++; }; } }));
// SVG rendering is unrelated to the reveal lifecycle; keep the real localized catalog.
mock.module('../src/features/characters/RarityArt', () => ({ RarityBackdrop: () => null, RarityFrame: () => null, RarityPortrait: () => null, rarityStyle: () => ({}) }));
const { ResultCard } = await import('../src/features/work/ResultCard');
const { setAppLanguage } = await import('../src/features/i18n');
const host = document.createElement('div'); document.body.append(host); let root = createRoot(host);
const session = (characterId: string | null = 'normal-nago', id = 'result-test') => ({ ...createSession(id, { focusMinutes: 1, restMinutes: 0, cycles: 1 }, 0, { stats: {}, headWidthRatio: .8 } as Baseline), status: 'completed' as const, acquiredCharacterId: characterId });
async function render(value = session(), celebrate = true) { await act(() => root.render(<StrictMode><ResultCard session={value} celebrate={celebrate} /></StrictMode>)); }
afterEach(async () => { await act(() => root.unmount()); root = createRoot(host); pending.clear(); now = 0; launches.length = 0; taps = 0; stops = 0; setAppLanguage('ja'); });

for (const [id, effect] of [['normal-nago', 'normal'], ['sakura-nago', 'sakura'], ['miira-nago', 'miira'], ['king-nago', 'king']]) {
  test(`${id}: acquisition finishes once, including Strict Mode and idle rerenders`, async () => {
    await render(session(id)); await advance(16);
    expect(launches).toEqual([effect]);
    await advance(10_000);
    expect(launches).toEqual([effect]);
    expect(host.querySelector('.is-entering')).toBeNull();
    await render(session(id)); await advance(1000);
    expect(launches).toEqual([effect]);
    expect(stops).toBe(0);
    await act(() => root.render(null)); expect(stops).toBe(1);
  });
}
test('tap and language changes do not replay acquisition; a new session does', async () => {
  await render(); await advance(3000);
  const originalName = host.querySelector('h2')!.textContent;
  await act(() => setAppLanguage('en')); await advance(16);
  expect(host.querySelector('h2')!.textContent).not.toBe(originalName);
  await act(() => host.querySelector<HTMLElement>('article')!.click()); await advance(600);
  expect(taps).toBe(1); expect(launches).toEqual(['normal']);
  await render(session('normal-nago', 'next-result')); await advance(16);
  expect(launches).toEqual(['normal', 'normal']); expect(stops).toBe(1);
});
test('collection and no reward do not celebrate; leaving before the first frame cancels it', async () => {
  await render(session(), false); await advance(3000); expect(launches).toEqual([]);
  await render(session(null)); await advance(3000); expect(launches).toEqual([]);
  await render(); await act(() => root.render(null)); await advance(3000); expect(launches).toEqual([]);
});
