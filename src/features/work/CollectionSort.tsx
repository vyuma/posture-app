import { t, useAppLanguage } from "../i18n";
import { OptionMenu } from './OptionMenu';
const options = [
  { value: 'number', label: '番号順' },
  { value: 'acquired', label: '獲得順' },
] as const;
export type CollectionOrder = typeof options[number]['value'];
export function CollectionSort({ value, onChange }: { value: CollectionOrder; onChange: (value: CollectionOrder) => void }) {
  useAppLanguage();
  return <OptionMenu value={value} onChange={onChange} options={options} label={t("コレクションの並び順")} className="work-sort"
    arrow={<svg className="work-sort-arrow" viewBox="0 0 18 18" aria-hidden="true"><path d="M1.20577 4.5H16.79423L9 18Z" fill="currentColor" /></svg>} />;
}
