import { useState } from 'react';
import { OptionMenu } from '../work/OptionMenu';
import { languages, setAppLanguage, t, useAppLanguage } from './index';
import './language-menu.css';

export function LanguageMenu() {
  const language = useAppLanguage();
  const [error, setError] = useState(false);
  return <div className="language-control">
    <OptionMenu value={language} options={languages} label={t('言語')} triggerLabel="Language" className="language-select"
      arrow={<img src="/figma/language.svg" width="22" height="22" alt="" draggable={false} />}
      onChange={value => { try { setAppLanguage(value); setError(false); } catch { setError(true); } }} />
    {error && <p className="language-error" role="alert">{t('言語を保存できませんでした。もう一度お試しください。')}</p>}
  </div>;
}
