import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import messages from '../src/features/i18n/messages.json';
import speech from '../src/features/posture/postureFeedback.json';
import { speechGeometry, widgetGeometry } from '../src/features/work/widgetPresentation';
const browser = new Window({ url: 'https://example.test/app' });
Object.assign(globalThis, { window: browser, document: browser.document, navigator: browser.navigator, location: browser.location, localStorage: browser.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { t, getAppLanguage, setAppLanguage, useAppLanguage } = await import('../src/features/i18n');
const { LANGUAGE_KEY, subscribeAppLanguage } = await import('../src/features/i18n/language');
const { LanguageMenu } = await import('../src/features/i18n/LanguageMenu');
const { character, catalog } = await import('../src/features/work/CharacterCard');
let root: Root, host: HTMLElement;
beforeEach(() => { setAppLanguage('ja'); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); setAppLanguage('ja'); });
const keys = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
test('every translation preserves interpolation fields and has both languages', () => {
  for (const [source, values] of Object.entries(messages)) for (const language of ['ko', 'en'] as const) {
    expect(values[language].trim(), source).not.toBe('');
    expect(keys(values[language]), `${language}: ${source}`).toEqual(keys(source));
  }
  expect(t('選択した{count}件を送信', {count: 3}, 'en')).toBe('Upload selected records (3)');
  expect(t('unknown {name}', {name: 'value'}, 'ko')).toBe('unknown value');
});
test('language persists, invalid values are rejected, and failed writes keep the old language', () => {
  setAppLanguage('ko'); expect(getAppLanguage()).toBe('ko'); expect(localStorage.getItem(LANGUAGE_KEY)).toBe('ko'); expect(document.documentElement.lang).toBe('ko');
  expect(() => setAppLanguage('fr' as 'ja')).toThrow(); expect(getAppLanguage()).toBe('ko');
  const original = globalThis.localStorage;
  Object.assign(globalThis, {localStorage: {setItem: () => { throw new Error('storage unavailable'); }}});
  try { expect(() => setAppLanguage('en')).toThrow(); expect(getAppLanguage()).toBe('ko'); }
  finally { Object.assign(globalThis, {localStorage: original}); }
});
test('other-window changes update subscribers but unrelated or session storage does not', () => {
  let calls = 0; const off = subscribeAppLanguage(() => calls++);
  const change = (key: string | null, newValue: string | null, storageArea = browser.localStorage) => browser.dispatchEvent(new browser.StorageEvent('storage', {key,newValue,storageArea}));
  change('unrelated', 'en'); expect(calls).toBe(0);
  change(LANGUAGE_KEY, 'ko'); expect(getAppLanguage()).toBe('ko'); expect(calls).toBe(1);
  change(LANGUAGE_KEY, 'en', browser.sessionStorage); expect(getAppLanguage()).toBe('ko');
  change(LANGUAGE_KEY, 'ko'); expect(calls).toBe(1);
  change(LANGUAGE_KEY, 'invalid'); expect(getAppLanguage()).toBe('ja');
  off();
});
test('language menu preserves component state and returns keyboard focus', async () => {
  function Probe() { useAppLanguage(); const [count, setCount] = useState(0); return <><LanguageMenu/><button data-counter onClick={() => setCount(count + 1)}>{count} {t('集中')}</button></>; }
  await act(() => root.render(<Probe/>));
  await act(() => (host.querySelector('[data-counter]') as HTMLButtonElement).click());
  const trigger = host.querySelector('.language-select-trigger') as HTMLButtonElement;
  await act(() => trigger.click());
  expect(host.querySelector('[role=menu]')).not.toBeNull();
  const options = host.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]');
  await act(() => options[2].click());
  expect(host.querySelector('[data-counter]')!.textContent).toBe('1 Focus');
  expect(host.querySelector('[role=menu]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  await act(() => trigger.click());
  await act(() => host.querySelector('[role=menu]')!.dispatchEvent(new browser.KeyboardEvent('keydown', {key:'Escape',bubbles:true}) as unknown as Event));
  expect(host.querySelector('[role=menu]')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
test('localized character display does not modify catalog identity or persisted text', () => {
  const original = JSON.stringify(catalog); const japanese = character('normal-nago');
  setAppLanguage('en'); const english = character('normal-nago');
  expect(english.id).toBe(japanese.id); expect(english.portraitSrc).toBe(japanese.portraitSrc); expect(english.name).not.toBe(japanese.name); expect(JSON.stringify(catalog)).toBe(original);
});
test('every feedback cause is translated and fits the shared widget balloon', () => {
  for (const source of Object.values(speech)) for (const language of ['ko','en'] as const) {
    const text = t(source, {}, language); expect(text).not.toBe(source);
    const g = speechGeometry(widgetGeometry('bad', 1), text);
    expect(g.bubbleWidth, text).toBeLessThan(390);
  }
});
