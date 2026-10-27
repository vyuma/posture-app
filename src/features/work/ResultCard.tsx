import { useRef, useState } from 'react';
import { shareResultCapture } from '../../lib/shareResultCapture';
import { CharacterStars } from '../characters/CharacterStars';
import { character, characterStyle, numberOf, Portrait } from './CharacterCard';
import { goodRatio, type Session } from './model';
import { ScoreGraph } from './ScoreGraph';
import { Icon } from './Dialog';
export function ResultCard({ session }: { session: Session }) {
  const ref = useRef<HTMLElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const item = session.acquiredCharacterId ? character(session.acquiredCharacterId) : null; const ratio = goodRatio(session);
  async function exportCard(share: boolean) {
    if (!ref.current) return; setBusy(true); setError('');
    try {
      const outcome = await shareResultCapture(ref.current, { action: share ? 'auto' : 'download' });
      if (outcome === 'copied') setError('画像をクリップボードにコピーしました');
      if (outcome === 'downloaded') setError('画像を保存しました');
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('画像を保存できませんでした。もう一度お試しください。'); }
    finally { setBusy(false); }
  }
  return <div className="work-result"><article className={`work-detail-card${!item ? ' no-reward' : ''}`} ref={ref} style={item ? characterStyle(item.id) : undefined}><div className="work-detail-character"><div className="work-detail-art">{item ? <Portrait id={item.id} /> : <img className="work-unacquired" src="/figma/result-unacquired.png" alt="今回はピンアナゴ未獲得" />}</div><span className="work-card-number">{item ? numberOf(item.id) : '???'}</span><div className="work-detail-name"><h2>{item?.name ?? 'またチャレンジ！'}</h2>{item && <CharacterStars characterId={item.id} />}</div>{item && <div className="work-tags">{item.personalityTags?.map(tag => <span key={tag}>{tag}</span>)}</div>}</div><div className="work-detail-body"><time dateTime={session.endedAt ?? session.startedAt}>{(session.endedAt || session.startedAt) ? new Date(session.endedAt || session.startedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '取得日時の記録なし'}</time><div className="work-result-metrics"><div>集中した時間<strong>{Math.floor(session.focusMs / 60_000)}<small>分</small></strong></div><div>ピーン率<strong>{ratio === null ? '—' : Math.round(ratio * 100)}{ratio !== null && <small>％</small>}</strong></div></div><ScoreGraph session={session} /><p>{item?.story ?? (session.rewardQualified ? '登場中の仲間をすべて獲得しました！' : 'ピーン率50％以上で、新しい仲間がやってくるよ。')}</p></div></article><div className="work-result-actions"><button className="work-button white" disabled={busy} onClick={() => void exportCard(false)}><Icon name="download" />画像を保存</button><button className="work-button blue" disabled={busy} onClick={() => void exportCard(true)}>シェア</button></div>{error && <p role="status">{error}</p>}</div>;
}
