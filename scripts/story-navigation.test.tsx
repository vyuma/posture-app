import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const browser = new Window({ url: 'https://example.test/app' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage, HTMLElement: browser.HTMLElement, HTMLButtonElement: browser.HTMLButtonElement,
  ResizeObserver: browser.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true });
browser.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as typeof browser.matchMedia;
mock.module('../src/features/onboarding/components/StoryAnago', () => ({ StoryAnago: ({pose}: {pose: string}) => <div data-pose={pose} /> }));
mock.module('../src/features/onboarding/useStoryCardDrag', () => ({ useStoryCardDrag: () => ({current: null}) }));
const { OnboardingStoryScreen } = await import('../src/features/onboarding/components/OnboardingStoryScreen');
const host = document.createElement('div'); document.body.append(host);
let root = createRoot(host);
const { setAppLanguage } = await import('../src/features/i18n');
afterEach(async () => { await act(() => root.unmount()); root = createRoot(host); setAppLanguage('ja'); });

test('start at story 2, navigate both directions, and finish without the removed scene or duplicate hero', async () => {
  let completed = 0;
  await act(() => root.render(<OnboardingStoryScreen onComplete={() => completed++} />));
  const click = async (selector: string) => {
    const button = host.querySelector<HTMLButtonElement>(selector); expect(button).not.toBeNull();
    await act(() => button!.click());
    expect(host.querySelector('.onboarding--intro')).toBeNull();
  };
  const next = () => click('.onboarding-arrow--next');
  await click('.onboarding-start');
  expect(host.querySelector('[data-pose="happy"]')).not.toBeNull();
  expect(host.textContent).toContain('はじめまして、ボクはピンアナゴ。');
  expect(host.textContent).toContain('1 / 4');
  expect(host.querySelector('.onboarding-arrow--back')).toBeNull();
  await next();
  expect(host.querySelector('[data-pose="intro"]')).not.toBeNull();
  expect(host.querySelector('.onboarding-warning-speech')?.textContent).toBe('首が曲がってるよ！');
  expect(host.textContent).toContain('どこを直せばいいか教えてあげるよ！');
  await click('.onboarding-arrow--back');
  expect(host.querySelector('[data-pose="happy"]')).not.toBeNull();
  expect(host.querySelector('.onboarding-warning-speech')).toBeNull();
  await next(); await next();
  expect(host.textContent).toContain('正しい姿勢をキープできたら、');
  expect(host.textContent).not.toContain('50％');
  expect(host.querySelector('.onboarding-hero')).toBeNull();
  expect(host.querySelectorAll('.onboarding-friends img')).toHaveLength(7);
  await next();
  expect(host.querySelector('.onboarding-gallery')).not.toBeNull();
  expect(host.textContent).toContain('4 / 4');
  await next(); expect(completed).toBe(1);
  await next(); expect(completed).toBe(1);
});


test('splash language selection persists and its keyboard input never advances the story', async () => {
  await act(() => root.render(<OnboardingStoryScreen onComplete={() => {}} />));
  const trigger = host.querySelector<HTMLButtonElement>('.language-select-trigger')!;
  expect(trigger).not.toBeNull();
  await act(() => trigger.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }) as unknown as Event));
  expect(host.querySelector('.onboarding--splash')).not.toBeNull();
  await act(() => trigger.click());
  const options = host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
  expect(options).toHaveLength(3);
  await act(() => options[0].dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }) as unknown as Event));
  expect(host.querySelector('.onboarding--splash')).not.toBeNull();
  await act(() => options[2].click());
  expect(host.querySelector('.onboarding-start')?.textContent).toBe('Get started');
  expect(localStorage.getItem('piiin-display-language')).toBe('en');
  expect(document.activeElement).toBe(trigger);
  await act(() => trigger.click());
  await act(() => host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[1].click());
  expect(host.querySelector('.onboarding-start')?.textContent).toBe('시작하기');
  expect(localStorage.getItem('piiin-display-language')).toBe('ko');
  await act(() => host.querySelector<HTMLButtonElement>('.onboarding-start')!.click());
  expect(host.textContent).toContain('안녕, 나는 핀아나고야.');
  expect(host.querySelector('.onboarding-language')).toBeNull();
});
