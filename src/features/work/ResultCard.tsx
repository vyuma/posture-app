import { RarityBackdrop, RarityFrame, RarityPortrait, rarityStyle } from '../characters/RarityArt';
import { getRarityEffect, rarityEffects } from '../characters/rarityEffects';
import { playRarityAcquisitionConfetti } from '../../lib/playRarityAcquisitionConfetti';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { playAcquisitionConfetti, playCardTapConfetti } from '../../lib/playAcquisitionConfetti';
import { onResultCardMouseMove, onResultCardMouseLeave } from './resultCardTilt';
import { shareResultCapture } from '../../lib/shareResultCapture';
import { CharacterStars } from '../characters/CharacterStars';
import { character, characterStyle, numberOf, Portrait } from './CharacterCard';
import { goodRatio, type Session } from './model';
import { CardStory } from './CardStory';
import { ScoreGraph } from './ScoreGraph';
import { ResultShareGlyph, ResultDownloadGlyph } from './ResultActionGlyphs';
import './result-card.css';
import './result-card-effects.css';
import type { TimelapseStore } from '../timelapse/storage';
import { TimelapseEntry } from '../timelapse/TimelapseEntry';
import '../timelapse/timelapse.css';
function resultDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '取得日時の記録なし';
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${two(date.getMonth() + 1)}/${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
export function ResultCard({ session, celebrate = false, variant = 'result', onTimelapse, timelapseStore }: { session: Session; celebrate?: boolean; variant?: 'result' | 'collection'; onTimelapse?: () => void; timelapseStore?: TimelapseStore }) {
  const ref = useRef<HTMLElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const item = session.acquiredCharacterId ? character(session.acquiredCharacterId) : null; const ratio = goodRatio(session);
  const effect = getRarityEffect(item?.id);
  const [entering, setEntering] = useState(celebrate && Boolean(item));
  const [tapped, setTapped] = useState(false);
  const tapFrame = useRef(0); const tapTimer = useRef(0);
  const tapController = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!celebrate || !item) return;
    // Defer one frame so Strict Mode's effect replay cancels the first launch.
    setEntering(true);
    let stopConfetti: (() => void) | undefined;
    const frame = requestAnimationFrame(() => { stopConfetti = effect ? playRarityAcquisitionConfetti(effect) : playAcquisitionConfetti({ characterColors: item.characterColor }); });
    const timer = window.setTimeout(() => setEntering(false), effect ? rarityEffects[effect].acquisitionMs : 760);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); stopConfetti?.(); };
  }, [celebrate, item, session.id, effect]);
  useEffect(() => {
    const controller = new AbortController();
    tapController.current = controller;
    return () => { cancelAnimationFrame(tapFrame.current); clearTimeout(tapTimer.current); controller.abort(); };
  }, []);
  function tap(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (!celebrate || !item || target?.closest('button,input')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    playCardTapConfetti({ signal: tapController.current?.signal, clientX: event.clientX || rect.left + rect.width / 2, clientY: event.clientY || rect.top + rect.height / 2, elementWidth: rect.width, elementHeight: rect.height, characterColors: item.characterColor });
    // Keep graph coordinates stable while inspecting a sample; only emit confetti.
    if (target?.closest('.work-graph')) return;
    setTapped(false); cancelAnimationFrame(tapFrame.current);
    tapFrame.current = requestAnimationFrame(() => setTapped(true));
    clearTimeout(tapTimer.current); tapTimer.current = window.setTimeout(() => setTapped(false), 520);
  }
  async function exportCard(share: boolean) {
    if (!ref.current) return; setBusy(true); setError('');
    try {
      const outcome = await shareResultCapture(ref.current, { action: share ? 'auto' : 'download' });
      if (outcome === 'copied') setError('画像をクリップボードにコピーしました');
      if (outcome === 'downloaded') setError('画像を保存しました');
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('画像を保存できませんでした。もう一度お試しください。'); }
    finally { setBusy(false); }
  }
  return <div className="work-result"><div className="work-result-frame"><article key={`${session.id}-${item?.id}`} data-rarity-effect={effect} data-variant={variant} className={`work-detail-card${!item ? ' no-reward' : ' work-detail-card--acquired'}${entering ? ' is-entering' : ''}${tapped ? ' is-tapped' : ''}${effect ? ' rarity-play' : ''}`} ref={ref} onClick={tap} onMouseMove={celebrate && item ? event => { if (event.target instanceof Element && event.target.closest('.work-graph')) onResultCardMouseLeave(event); else onResultCardMouseMove(event); } : undefined} onMouseLeave={celebrate && item ? onResultCardMouseLeave : undefined} style={item ? { ...characterStyle(item.id), ...rarityStyle(item.id) } : undefined}><div className="work-detail-character"><div className="work-detail-art">{effect && <RarityBackdrop effect={effect} />}{item ? effect ? <RarityPortrait id={item.id} src={item.portraitSrc} name={item.name} /> : <Portrait id={item.id} /> : <img className="work-unacquired" src="/figma/result-unacquired.png" alt="今回はピンアナゴ未獲得" />}</div><span className="work-card-number">{item ? numberOf(item.id) : '？？？'}</span><div className="work-detail-name"><h2>{item?.name ?? '?????'}</h2><CharacterStars characterId={item?.id} /></div><div className="work-tags">{(item?.personalityTags ?? ['?????', '?????']).map((tag, index) => <span key={index}>{tag}</span>)}</div></div><div className="work-detail-body">{variant === 'collection' && onTimelapse && <TimelapseEntry store={timelapseStore} compact sessionId={session.id} onOpen={onTimelapse} />}<time dateTime={session.endedAt ?? session.startedAt}>{resultDate(session.endedAt || session.startedAt)}</time><div className="work-result-metrics"><div><span>集中した時間</span><strong data-long={session.focusMs >= 1000 * 60_000}>{Math.floor(session.focusMs / 60_000)}</strong><small>分</small></div><div data-full-rate={ratio !== null && Math.round(ratio * 100) === 100}><span>ピーン率</span><strong>{ratio === null ? '—' : Math.round(ratio * 100)}</strong>{ratio !== null && <small>%</small>}</div></div><ScoreGraph session={session} /><CardStory>{item?.story ?? '？？？？？？？？？？？？？？？？？？？？？？？？？'}</CardStory></div>{effect && <RarityFrame effect={effect} />}</article></div><div className="work-result-actions" role="toolbar" aria-label="カードの共有と保存"><button disabled={busy} aria-label="結果を画像で共有" title="結果を画像で共有" onClick={() => void exportCard(true)}><ResultShareGlyph /></button><button disabled={busy} aria-label="結果画像を保存" title="結果画像を保存" onClick={() => void exportCard(false)}><ResultDownloadGlyph /></button></div><p className="work-result-feedback" role="status">{error}</p></div>;
}
