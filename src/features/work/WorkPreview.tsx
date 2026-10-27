/** Development-only visual fixtures. Never reads or writes the user's collection. */
import { useEffect, useRef, useState } from 'react';
import { Home, CharacterPicker } from './Home';
import { TimerSettings } from './TimerSettings';
import { MeasureScreen, type MeasureStage } from './MeasureScreen';
import { ResultCard } from './ResultCard';
import { Dialog } from './Dialog';
import { Widget, type WidgetState } from './Widget';
import { catalog } from './CharacterCard';
import { isDesktop, publishWidget, subscribeWidgetActions } from './platform';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_TIMER, EMPTY_COLLECTION, createSession, type Baseline, type Collection, type Session } from './model';
import '../../styles/base.css';
import './work.css';
const date = '2026-10-27T09:00:00.000Z';
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
  const [screen, setScreen] = useState('home'); const [detail, setDetail] = useState<Session | null>(null);
  const [collection, setCollection] = useState<Collection>({ ...EMPTY_COLLECTION, cards: catalog.map(item => ({ characterId: item.id, measurementId: `preview-${item.id}`, acquiredAt: date, generation: 0 })) });
  const [widget, setWidget] = useState<WidgetState | null>(null); const video = useRef<HTMLVideoElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  widgetRef.current = widget;
  function publish(value: WidgetState | null) { setWidget(value); void publishWidget(value).catch(error => setDiagnostic(String(error))); }
  useEffect(() => { let cleanup: (() => void) | undefined; let cancelled = false; void subscribeWidgetActions((id, action) => { if (id !== 'preview') return; if (action === 'finish') publish(null); else if (widgetRef.current && action !== 'open') publish({ ...widgetRef.current, paused: action === 'pause' }); }).then(fn => { if (cancelled) fn(); else cleanup = fn; }); return () => { cancelled = true; cleanup?.(); }; }, []);
  const session = { ...result(), status: screen === 'pause' ? 'paused' : 'running', phase: screen === 'rest' ? 'rest' : 'focus', remainingMs: 21 * 60_000 + 22_000, cycle: 1 } as Session;
  const stage: MeasureStage = ['prepare', 'calibrate', 'ready'].includes(screen) ? screen as MeasureStage : 'active';
  function showWidget(bad: boolean) { const value: WidgetState = { sessionId: 'preview', remainingMs: 145000, durationMs: 300000, phase: 'focus', paused: false, bad, badSince: bad ? Date.now() : null, cycle: 1, cycles: 4 }; publish(value); }
  return <div className="work-app"><nav aria-label="表示検証" style={{ position: 'fixed', zIndex: 20000, bottom: 0, left: 0, maxWidth: '100%', background: '#222', color: 'white', padding: 5, display: 'flex', gap: 5, flexWrap: 'wrap', fontSize: 11 }}><span>検証用サンプル {diagnostic}</span>{isDesktop && [720,1200].map(width => <button key={width} onClick={() => { void invoke('work_preview_window', { width, height: width === 720 ? 540 : 780 }).catch(error => setDiagnostic(String(error))); }}>{width}px</button>)}{['home', 'picker', 'timer', 'prepare', 'calibrate', 'ready', 'active', 'rest', 'pause', 'result'].map(value => <button key={value} onClick={() => setScreen(value)}>{value}</button>)}<button onClick={() => setCollection(value => ({ ...value, selectedId: null, cards: [] }))}>0枚</button><button onClick={() => setCollection({ ...EMPTY_COLLECTION, cards: catalog.filter(item => ['normal-nago', 'oto-anago'].includes(item.id)).map(item => ({ characterId: item.id, measurementId: `preview-${item.id}`, acquiredAt: date, generation: 0 })) })}>2枚</button><button onClick={() => showWidget(false)}>Widget</button><button onClick={() => showWidget(true)}>Angry</button><button onClick={() => { publish(null); }}>Hide widget</button></nav>
  {screen === 'home' && <Home collection={collection} onStart={() => setScreen('timer')} onPick={() => setScreen('picker')} onCard={card => setDetail(result(card.characterId))} onReset={() => setCollection(value => ({ ...value, cards: [] }))} onStory={() => {}} onSound={() => {}} />}
  {screen === 'picker' && <CharacterPicker collection={collection} onConfirm={id => { setCollection(value => ({ ...value, selectedId: id })); setScreen('home'); }} onClose={() => setScreen('home')} />}
  {screen === 'timer' && <TimerSettings saved={null} onSubmit={() => setScreen('prepare')} onClose={() => setScreen('home')} />}
  {['prepare', 'calibrate', 'ready', 'active', 'rest', 'pause'].includes(screen) && <MeasureScreen stage={stage} session={session} videoRef={video} canvasRef={canvas} status="カメラを使わない表示検証です" ready remainingCalibrationMs={3000} tracking onRegister={() => setScreen('calibrate')} onCancel={() => setScreen('home')} onRecalibrate={() => setScreen('calibrate')} onPause={() => setScreen(screen === 'pause' ? 'active' : 'pause')} onFinish={() => setScreen('result')} onSound={() => {}} />}
  {screen === 'result' && <main className="work-screen work-result-screen"><h1>新しい仲間がやってきた！</h1><ResultCard session={result()} /></main>}
  {detail && <Dialog title="獲得カードの詳細" className="work-detail-dialog" onClose={() => setDetail(null)}><ResultCard session={detail} /></Dialog>}
  {!isDesktop && widget && <Widget state={widget} onAction={action => { if (action === 'finish') { publish(null); } else { const next = { ...widget, paused: !widget.paused }; publish(next); } }} />}
  </div>;
}
