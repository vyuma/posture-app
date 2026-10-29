/** Development-only visual fixtures. Never reads or writes the user's collection. */
import { useWorkScreenTransition } from './useWorkScreenTransition';
import { useEffect, useRef, useState } from 'react';
import { Home, CharacterPicker } from './Home';
import { StoryHomeTransition, OnboardingStoryScreen } from '../onboarding';
import '../../styles/onboarding.css';
import { TimerSettings } from './TimerSettings';
import { TimelapseSettings } from '../timelapse/TimelapseSettings';
import { NextRewardSetting } from './NextRewardSetting';
import { DEFAULT_TIMELAPSE } from '../timelapse/model';
import { MeasureScreen, type MeasureStage } from './MeasureScreen';
import { ResultCard } from './ResultCard';
import { ResultScreen } from './ResultScreen';
import { Dialog } from './Dialog';
import { FinishDialog } from './FinishDialog';
import { Widget, type WidgetState } from './Widget';
import { catalog } from './CharacterCard';
import { isDesktop, publishWidget, subscribeWidgetActions } from './platform';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_TIMER, EMPTY_COLLECTION, createSession, type Baseline, type Collection, type Session } from './model';
import '../../styles/base.css';
import './work.css';
import { DEFAULT_SOUND_SETTINGS } from '../sound/types/soundSettings';
import './responsive-layout.css';
import { RarityPreview } from './RarityPreview';
import { FeedbackPreview } from './FeedbackPreview';
const date = '2026-05-07T08:49:00+09:00';
function result(id = 'oto-anago'): Session {
  const session = createSession(`preview-${id}`, DEFAULT_TIMER, 0, { stats: {}, headWidthRatio: null } as Baseline);
  Object.assign(session, { startedAt: date, endedAt: date, status: 'completed', acquiredCharacterId: id, focusMs: 140 * 60_000, validMs: 100_000, goodMs: 78_000, rewardQualified: true });
  session.samples = Array.from({ length: 141 }, (_, i) => ({ sequence: i, focusMs: i * 60_000, elapsedMs: i * 60_000, calibrationId: 'preview', segment: i < 60 ? 0 : 1, score: 70 + Math.sin(i / 12) * 17 - (i > 30 && i < 60 ? 50 : 0), deviation: 1, state: 'good' as const }));
  session.events.push({ kind: 'calibrated', focusMs: 60 * 60_000, elapsedMs: 60 * 60_000, segment: 1 }); return session;
}
export default function WorkPreview() {
  const [diagnostic, setDiagnostic] = useState(`${innerWidth}×${innerHeight}`);
  const widgetRef = useRef<WidgetState | null>(null);
  useEffect(() => { const resize = () => setDiagnostic(`${innerWidth}×${innerHeight}`); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const [sound, setSound] = useState(DEFAULT_SOUND_SETTINGS);
  const [videoSettings, setVideoSettings] = useState(DEFAULT_TIMELAPSE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [calibrationMs, setCalibrationMs] = useState(5000);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [previewCharacter, setPreviewCharacter] = useState('oto-anago');
  const [screen, setScreen] = useState('home'); const [detail, setDetail] = useState<Session | null>(null);
  useEffect(() => {
    if (screen !== 'calibrate') return;
    const started = performance.now(); setCalibrationMs(5000);
    const interval = window.setInterval(() => { const remaining = Math.max(0, 5000 - (performance.now() - started)); setCalibrationMs(remaining); if (!remaining) setScreen('ready'); }, 80);
    return () => clearInterval(interval);
  }, [screen]);
  const [collection, setCollection] = useState<Collection>({ ...EMPTY_COLLECTION, cards: catalog.map(item => ({ characterId: item.id, measurementId: `preview-${item.id}`, acquiredAt: date, generation: 0 })) });
  const [widget, setWidget] = useState<WidgetState | null>(null); const video = useRef<HTMLVideoElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  widgetRef.current = widget;
  function publish(value: WidgetState | null) { setWidget(value); void publishWidget(value).catch(error => setDiagnostic(String(error))); }
  useEffect(() => { let cleanup: (() => void) | undefined; let cancelled = false; void subscribeWidgetActions((id, action) => { if (id !== 'preview') return; if (action === 'finish') publish(null); else if (widgetRef.current && action !== 'open') publish({ ...widgetRef.current, paused: action === 'pause' }); }).then(fn => { if (cancelled) fn(); else cleanup = fn; }); return () => { cancelled = true; cleanup?.(); }; }, []);
  const session = { ...result(previewCharacter), status: screen === 'pause' ? 'paused' : 'running', phase: screen === 'rest' ? 'rest' : 'focus', remainingMs: 21 * 60_000 + 22_000, cycle: 1 } as Session;
  const stage: MeasureStage = ['prepare', 'calibrate', 'ready'].includes(screen) ? screen as MeasureStage : 'active';
  function showWidget(bad: boolean, phase: 'focus' | 'rest' = 'focus', paused = false) { const value: WidgetState = { sessionId: 'preview', remainingMs: phase === 'rest' ? 240000 : 923000, durationMs: phase === 'rest' ? 300000 : 1500000, phase, paused, bad, badSince: bad ? Date.now() : null, cycle: 1, cycles: 4 }; publish(value); }
  const transitionRoot = useWorkScreenTransition(screen);
  return <div ref={transitionRoot} className="work-app"><nav aria-label="表示検証" style={{ position: 'fixed', zIndex: 20000, bottom: 0, left: 0, maxWidth: '100%', background: '#222', color: 'white', padding: 5, display: 'flex', gap: 5, flexWrap: 'wrap', fontSize: 11 }}><span>検証用サンプル {diagnostic}</span><select aria-label="検証キャラクター" value={previewCharacter} onChange={event => setPreviewCharacter(event.target.value)}>{catalog.map(item => <option key={item.id} value={item.id}>{String(item.number).padStart(3, '0')} {item.name}</option>)}</select>{isDesktop && [720,1200,1512].map(width => <button key={width} onClick={() => { void invoke('work_preview_window', { width, height: width === 720 ? 540 : width === 1512 ? 1010 : 780 }).catch(error => setDiagnostic(String(error))); }}>{width}px</button>)}{['home', 'rarity', 'story', 'widget-stage', 'picker', 'timer', 'prepare', 'calibrate', 'ready', 'active', 'rest', 'pause', 'result', 'no-reward', 'no-graph'].map(value => <button key={value} onClick={() => setScreen(value)}>{value}</button>)}<button onClick={() => setCollection(value => ({ ...value, selectedId: null, cards: [] }))}>0枚</button><button onClick={() => setCollection({ ...EMPTY_COLLECTION, cards: catalog.filter(item => ['normal-nago', 'oto-anago'].includes(item.id)).map(item => ({ characterId: item.id, measurementId: `preview-${item.id}`, acquiredAt: date, generation: 0 })) })}>2枚</button><button onClick={() => showWidget(false)}>Widget</button><button onClick={() => showWidget(true)}>Angry</button><button onClick={() => showWidget(false, 'rest')}>Widget rest</button><button onClick={() => showWidget(false, 'focus', true)}>Widget paused</button><button onClick={() => widget && publish({ ...widget, remainingMs: 120 * 60000, durationMs: 120 * 60000 })}>Widget 120</button><button onClick={() => { publish(null); }}>Hide widget</button></nav>
  <div className="work-flow">
  {screen === 'widget-stage' && <><div aria-label="ウィジェットの検証背景" style={{position:'fixed',inset:0,background:'linear-gradient(155deg,#58b8de,#12377e)'}} /><FeedbackPreview publish={publish} /></>}
    {(screen === 'home' || screen === 'story') && <StoryHomeTransition view={screen}>
      {shown => shown === 'story' ? <OnboardingStoryScreen onComplete={() => setScreen('home')} /> : <Home collection={collection} onStart={() => setScreen('timer')} onPick={() => setScreen('picker')} onCard={card => setDetail(result(card.characterId))} onReset={() => setCollection(value => ({ ...value, cards: [] }))} onStory={() => setScreen('story')} onSound={() => {}} onSettings={() => setSettingsOpen(true)} />}
    </StoryHomeTransition>}
  {screen === 'picker' && <CharacterPicker collection={collection} onConfirm={id => { setCollection(value => ({ ...value, selectedId: id })); setScreen('home'); }} onClose={() => setScreen('home')} />}
  {screen === 'timer' && <TimerSettings saved={null} onSubmit={() => setScreen('prepare')} onClose={() => setScreen('home')} />}
  {['prepare', 'calibrate', 'ready', 'active', 'rest', 'pause'].includes(screen) && <MeasureScreen stage={stage} session={session} videoRef={video} canvasRef={canvas} status="カメラを使わない表示検証です" ready remainingCalibrationMs={calibrationMs} tracking onRegister={() => setScreen('calibrate')} onCancel={() => setScreen('home')} onRecalibrate={() => setScreen('prepare')} onPause={() => setScreen(screen === 'pause' ? 'active' : 'pause')} onFinish={() => setFinishOpen(true)} sound={sound} onSoundChange={setSound} widgetEnabled={widgetEnabled} onWidgetChange={setWidgetEnabled} />}
  {screen === 'rarity' && <RarityPreview session={result(previewCharacter)} />}
  {['result', 'no-reward', 'no-graph'].includes(screen) && <ResultScreen key={screen} session={screen === 'no-reward' ? { ...result(previewCharacter), acquiredCharacterId: null, rewardQualified: false, goodMs: 49_000 } : screen === 'no-graph' ? { ...result(previewCharacter), samples: [] } : result(previewCharacter)} onHome={() => setScreen('home')} onTimelapse={() => {}} />}
  {finishOpen && <FinishDialog onContinue={() => setFinishOpen(false)} onFinish={() => { setFinishOpen(false); setScreen('result'); }} />}
  {settingsOpen && <TimelapseSettings value={videoSettings} onChange={setVideoSettings} onClose={() => setSettingsOpen(false)}><NextRewardSetting collection={collection} onChange={async id => { setCollection(value => ({ ...value, nextRewardId: id })); }} /></TimelapseSettings>}
  {detail && <Dialog title="獲得カードの詳細" className="work-detail-dialog" onClose={() => setDetail(null)}><ResultCard session={detail} variant="collection" /></Dialog>}
  {!isDesktop && widget && <Widget state={widget} onAction={action => { if (action === 'finish') { publish(null); } else if (action !== 'open') { publish({ ...widget, paused: action === 'pause' }); } }} />}
  </div></div>;
}
