import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { CharacterStars } from '../characters/CharacterStars';
import { character, characterStyle, numberOf, Portrait } from '../work/CharacterCard';
import { CardStory } from '../work/CardStory';
import { ScoreGraph } from '../work/ScoreGraph';
import { DEFAULT_TIMER, type Session } from '../work/model';
import { playAcquisitionConfetti, playCardTapConfetti } from '../../lib/playAcquisitionConfetti';
import { onResultCardMouseLeave, onResultCardMouseMove } from '../work/resultCardTilt';
import { useReplayScene } from './useReplayScene';
import '../work/result-card.css';
import '../work/result-card-effects.css';

const oto = character('oto-anago');
const sample: Session = {
  id: 'landing-sample', startedAt: '2026-05-07T08:49:00+09:00', endedAt: '2026-05-07T08:49:00+09:00',
  status: 'completed', settings: DEFAULT_TIMER, phase: 'focus', cycle: 4, remainingMs: 0,
  focusMs: 140 * 60_000, validMs: 140 * 60_000, goodMs: 140 * 60_000 * .78, elapsedMs: 140 * 60_000,
  generation: 0, calibrations: [], samples: [], events: [], segment: 0, acquiredCharacterId: oto.id,
  rewardQualified: true, lastTickMs: null, wasPaused: false, lastSampleFocusMs: 0, tracking: null,
};
sample.samples = [92, 72, 80, 70, 74, 55, 87, 82, 72, 78, 70, 67, 76, 80, 74, 79, 72, 86, 76, 80, 83].map((score, i, scores) => ({ sequence: i, focusMs: sample.focusMs * i / (scores.length - 1), elapsedMs: sample.focusMs * i / (scores.length - 1), calibrationId: 'sample', segment: 0, score, deviation: null, state: 'good' }));

/** Product card styling and effects, with an explicitly illustrative LP measurement. */
export function LandingResultCard() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useReplayScene(host, .7);
  const [entering, setEntering] = useState(false), [tapped, setTapped] = useState(false);
  const tapFrame = useRef(0), tapTimer = useRef(0), tapController = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!scene.entered || scene.reduced) { setEntering(false); return; }
    setEntering(true);
    let stop: (() => void) | undefined;
    const frame = requestAnimationFrame(() => { stop = playAcquisitionConfetti({ characterColors: oto.characterColor }); });
    const timer = window.setTimeout(() => setEntering(false), 760);
    const hidden = () => { if (document.hidden) stop?.(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); stop?.(); document.removeEventListener('visibilitychange', hidden); };
  }, [scene.entered, scene.reduced]);
  useEffect(() => {
    const controller = new AbortController(); tapController.current = controller;
    setTapped(false);
    return () => { controller.abort(); clearTimeout(tapTimer.current); cancelAnimationFrame(tapFrame.current); };
  }, [scene.entered]);
  function tap(event: MouseEvent<HTMLElement>) {
    if ((event.target as Element).closest('input')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    playCardTapConfetti({ signal: tapController.current?.signal, clientX: event.clientX || rect.left + rect.width / 2, clientY: event.clientY || rect.top + rect.height / 2, elementWidth: rect.width, elementHeight: rect.height, characterColors: oto.characterColor });
    if ((event.target as Element).closest('.work-graph')) return;
    setTapped(false); cancelAnimationFrame(tapFrame.current);
    tapFrame.current = requestAnimationFrame(() => setTapped(true));
    clearTimeout(tapTimer.current); tapTimer.current = window.setTimeout(() => setTapped(false), 520);
  }
  return <div ref={host} className={`lp-new-result${scene.playing ? ' is-scene-playing' : ''}`} data-revealed={scene.entered}>
    <article className={`work-detail-card work-detail-card--acquired${entering ? ' is-entering' : ''}${tapped ? ' is-tapped' : ''}`} style={characterStyle(oto.id)} tabIndex={0} aria-label="獲得カードの表示例：オトアナゴ、集中した時間140分、ピーン率78％。クリックまたはEnterで獲得演出"
      onClick={tap} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }}
      onMouseMove={event => { if (scene.reduced || (event.target as Element).closest('.work-graph')) onResultCardMouseLeave(event); else onResultCardMouseMove(event); }} onMouseLeave={onResultCardMouseLeave}>
      <div className="work-detail-character">
        <div className="work-detail-art"><Portrait id={oto.id} /></div>
        <span className="work-card-number">{numberOf(oto.id)}</span>
        <div className="work-detail-name"><h2>{oto.name}</h2><CharacterStars characterId={oto.id} /></div>
        <div className="work-tags">{oto.personalityTags?.map(tag => <span key={tag}>{tag}</span>)}</div>
      </div>
      <div className="work-detail-body">
        <time dateTime="2026-05-07T08:49">2026/05/07 08:49</time>
        <div className="work-result-metrics"><div><span>集中した時間</span><strong>140</strong><small>分</small></div><div><span>ピーン率</span><strong>78</strong><small>%</small></div></div>
        <ScoreGraph session={sample} />
        <CardStory>{oto.story ?? ''}</CardStory>
      </div>
    </article>
  </div>;
}
