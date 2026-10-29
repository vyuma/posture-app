import { useState } from 'react';
import { catalog, numberOf } from './CharacterCard';
import type { Collection } from './model';
import { OptionMenu } from './OptionMenu';
import './next-reward-setting.css';

export function NextRewardSetting({ collection, onChange }: {
  collection: Collection;
  onChange: (id: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const acquired = new Set(collection.cards.map(card => card.characterId));
  const remaining = catalog.filter(item => !acquired.has(item.id));
  const value = remaining.some(item => item.id === collection.nextRewardId) ? collection.nextRewardId! : '';
  const options = [{ value: '', label: '指定しない（通常の抽選）' }, ...remaining.map(item => ({
    value: item.id, label: `${numberOf(item.id)} ${item.name}`,
  }))];

  async function change(id: string) {
    if (saving) return;
    setSaving(true); setError('');
    try { await onChange(id || null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存できませんでした。もう一度選んでください。'); }
    finally { setSaving(false); }
  }

  return <section className="work-next-reward-setting" aria-label="次に獲得するピンアナゴ" aria-busy={saving}>
    <h2>次に獲得するピンアナゴ</h2>
    <fieldset disabled={remaining.length === 0}>
      <OptionMenu value={value} onChange={id => void change(id)} options={options} disabled={saving}
        label="次に獲得するピンアナゴ" className="work-reward-select"
        arrow={<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M1.20577 4.5H16.79423L9 18Z" fill="currentColor" /></svg>} />
    </fieldset>
    <p className="timelapse-help">{remaining.length
      ? '未獲得のアナゴから選べます。獲得条件を満たした次の1回に適用し、獲得後は通常の抽選に戻ります。'
      : '現在登場しているピンアナゴは、すべて獲得済みです。'}</p>
    {saving && <p className="timelapse-help" role="status">保存中…</p>}
    {error && <p className="work-reward-error" role="alert">{error}</p>}
  </section>;
}
