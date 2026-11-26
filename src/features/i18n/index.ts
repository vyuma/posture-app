import messages from './messages.json';
import { getAppLanguage, type AppLanguage } from './language';
export { useAppLanguage, getAppLanguage, setAppLanguage, languages } from './language';
export type { AppLanguage } from './language';
type Values = Record<string, string | number | null | undefined>;
const dictionary: Record<string, { ko: string; en: string }> = messages;
/** Translate display text only; persisted IDs, measurements and consent versions stay unchanged. */
export function t(source: string, values: Values = {}, language: AppLanguage = getAppLanguage()): string {
  const text = language === 'ja' ? source : dictionary[source]?.[language] ?? source;
  return text.replace(/\{(\w+)\}/g, (token, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : token);
}
export function formatDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(getAppLanguage(), options).format(new Date(value));
}
