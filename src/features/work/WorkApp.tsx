import { useCallback, useEffect, useRef, useState } from 'react';
import { OnboardingStoryScreen, hasCompletedOnboardingStory, saveOnboardingStoryCompleted } from '../onboarding';
import { usePostureTracking } from '../posture/hooks/usePostureTracking';
import { configureRecoverySound, playRecoverySound, primeRecoverySound, playSoundPreview } from '../sound/services/recoverySound';
import { loadSoundSettings, saveSoundSettings } from '../sound/services/soundSettingsStorage';
import { SoundSettingsDialog } from '../sound/components/SoundSettingsDialog';
import { DesktopUpdater } from '../updates/DesktopUpdater';
import { Home, CharacterPicker, Brand } from './Home';
import { TimerSettings } from './TimerSettings';
import { MeasureScreen, type MeasureStage } from './MeasureScreen';
import { ResultCard } from './ResultCard';
import { Dialog } from './Dialog';
import { Widget, type WidgetAction, type WidgetState } from './Widget';
import { catalog } from './CharacterCard';
import { isDesktop, openWorkRepository, publishWidget, subscribeWidgetActions } from './platform';
import type { WorkRepository } from './repository';
import { acquireMeasurementLock } from './measurementLock';
import { beginCalibration, createSession, DEFAULT_TIMER, endCalibration, finishSession, pauseSession, resumeSession, NO_READING, type Baseline, type Card, type Collection, type Reading, type Session, type TimerSettings as Settings } from './model';
import '../../styles/base.css';
import '../../styles/onboarding.css';
import '../../styles/updates.css';
import './work.css';
import { advanceWithRestCue } from './sessionSound';

type Screen = 'home' | 'story' | 'picker' | 'timer' | MeasureStage | 'result';
const catalogIds = catalog.map(item => item.id);
export default function WorkApp() {
  const [screen, setScreen] = useState<Screen>(() => hasCompletedOnboardingStory() ? 'home' : 'story');
  const [collection, setCollection] = useState<Collection | null>(null); const [session, setSession] = useState<Session | null>(null);
  const [detail, setDetail] = useState<Session | null>(null); const [dialog, setDialog] = useState<'reset' | 'finish' | 'sound' | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [sound, setSound] = useState(loadSoundSettings); const [badSince, setBadSince] = useState<number | null>(null);
  const mounted = useRef(true); const releaseOwner = useRef<(() => void) | null>(null);
  const releaseMeasurement = useCallback(() => { releaseOwner.current?.(); releaseOwner.current = null; }, []);
  const repository = useRef<WorkRepository | null>(null); const live = useRef<Session | null>(null); const settings = useRef<Settings>(DEFAULT_TIMER);
  const pendingBaseline = useRef<Baseline | null>(null);
  const previousBaseline = useRef<Baseline | null>(null); const queue = useRef<Promise<unknown>>(Promise.resolve());
  const finalizePending = useRef(false); const calibrationAt = useRef(0); const [calibrationNonce, setCalibrationNonce] = useState(0);
  const stageRef = useRef(screen); stageRef.current = screen;
  const camera = ['prepare', 'calibrate', 'ready', 'active'].includes(screen);
  const posture = usePostureTracking({ enabled: camera, overlayEnabled: screen === 'prepare' || screen === 'calibrate', paused: screen === 'prepare' || screen === 'ready' || (screen === 'active' && (session?.status !== 'running' || session?.phase === 'rest')) });
  const snapshotRef = useRef(posture.snapshot); snapshotRef.current = posture.snapshot;
  const reading = useCallback((): Reading => { const snapshot = snapshotRef.current; return { valid: snapshot.qualityOk && snapshot.baselineReady && performance.now() - (snapshot.observedAtMs ?? 0) <= Math.max(1500, snapshot.trackingIntervalMs * 3), good: snapshot.postureState === 'good', deviation: snapshot.score }; }, []);
  const report = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : '保存に失敗しました。再試行してください。'), []);
  const enqueue = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => { const next = queue.current.catch(() => {}).then(operation); queue.current = next; return next; }, []);
  const refresh = useCallback(() => { if (live.current) setSession({ ...live.current }); }, []);
  const checkpoint = useCallback(() => { const current = live.current; if (!current || ['completed', 'interrupted'].includes(current.status)) return; const copy = structuredClone(current); void enqueue(() => repository.current!.checkpoint(copy)).catch(report); }, [enqueue, report]);

  useEffect(() => {
    let cancelled = false; mounted.current = true;
    void (async () => {
      const release = await acquireMeasurementLock();
      try {
        const repo = await openWorkRepository();
        if (cancelled) return;
        repository.current = repo;
        const value = await repo.initialize();
        const count = release && !cancelled ? await repo.recover() : 0;
        if (cancelled) return;
        setCollection(value);
        if (count) setNotice('前回の中断した測定記録を保存しました。新しく測定を始められます。');
      } finally { release?.(); }
    })().catch(cause => { if (!cancelled) report(cause); });
    return () => { cancelled = true; mounted.current = false; releaseMeasurement(); };
  }, [report, releaseMeasurement]);
  useEffect(() => { configureRecoverySound({ enabled: sound.enabled, src: sound.selectedSound, volume: sound.volume }); saveSoundSettings(sound); }, [sound]);
  useEffect(() => { const flush = () => checkpoint(); window.addEventListener('pagehide', flush); const interval = setInterval(flush, 5000); return () => { clearInterval(interval); window.removeEventListener('pagehide', flush); }; }, [checkpoint]);

  const finalize = useCallback(async () => {
    const current = live.current; if (!current || !repository.current || finalizePending.current) return;
    finalizePending.current = true; setBusy(true); setError('');
    try { const result = await enqueue(() => repository.current!.finish(structuredClone(current), catalogIds)); live.current = result.session; setSession(result.session); setCollection(result.collection); setDialog(null); setScreen('result'); releaseMeasurement(); void publishWidget(null).catch(report); }
    catch (cause) { report(cause); }
    finally { finalizePending.current = false; setBusy(false); }
  }, [enqueue, report, releaseMeasurement]);
  useEffect(() => {
    const interval = setInterval(() => { const current = live.current; if (!current || current.status === 'interrupted') return; if (current.status === 'completed') return;
      const previousEvents = current.events.length;
      advanceWithRestCue(current, performance.now(), reading(), playRecoverySound); refresh();
      if (current.status as Session['status'] === 'completed') void finalize();
      else if (current.events.length !== previousEvents) { checkpoint(); }
    }, 250);
    return () => clearInterval(interval);
  }, [checkpoint, finalize, reading, refresh]);

  const pause = useCallback(() => { const current = live.current; if (!current || stageRef.current !== 'active') return; advanceWithRestCue(current, performance.now(), reading(), playRecoverySound); if (current.status === 'completed') { void finalize(); return; } if (current.status === 'paused') resumeSession(current); else pauseSession(current, reading()); refresh(); checkpoint(); }, [checkpoint, finalize, reading, refresh]);
  const action = useCallback((name: WidgetAction) => { if (name === 'pause' || name === 'resume') pause(); else if (name === 'finish') setDialog('finish'); }, [pause]);
  useEffect(() => { let dispose: (() => void) | undefined; let cancelled = false; void subscribeWidgetActions((id, name) => { if (live.current?.id === id && stageRef.current === 'active') action(name); }).then(stop => { if (cancelled) stop(); else dispose = stop; }).catch(report); return () => { cancelled = true; dispose?.(); }; }, [action, report]);
  const bad = screen === 'active' && session?.status === 'running' && session.phase === 'focus' && reading().valid && posture.isBadPosture;
  useEffect(() => {
    setBadSince(current => bad ? current ?? Date.now() : null);
  }, [bad]);
  const widget: WidgetState | null = widgetEnabled && screen === 'active' && session && session.status !== 'completed' ? { sessionId: session.id, remainingMs: session.remainingMs, durationMs: (session.phase === 'focus' ? session.settings.focusMinutes : session.settings.restMinutes) * 60_000, phase: session.phase, paused: session.status !== 'running', bad: !!bad, badSince, cycle: session.cycle, cycles: session.settings.cycles } : null;
  useEffect(() => { void publishWidget(widget).catch(report); }, [screen, session, bad, badSince, widgetEnabled, report]);
  useEffect(() => () => { void publishWidget(null); }, []);

  function beginRegistration() { previousBaseline.current = posture.captureBaseline(); if (live.current && screen === 'active') { advanceWithRestCue(live.current, performance.now(), reading(), playRecoverySound); if (live.current.status === 'completed') { void finalize(); return; } beginCalibration(live.current, reading()); refresh(); checkpoint(); } posture.resetPostureEngine(); calibrationAt.current = performance.now(); setCalibrationNonce(value => value + 1); setScreen('calibrate'); }
  function cancelRegistration() {
    if (live.current?.status === 'recalibrating') { if (previousBaseline.current) posture.restoreBaseline(previousBaseline.current); endCalibration(live.current, null); refresh(); checkpoint(); setScreen('active'); }
    else { releaseMeasurement(); live.current = null; setSession(null); setScreen('home'); }
  }
  useEffect(() => {
    if (screen !== 'calibrate' || !posture.snapshot.baselineReady) return;
    const baseline = posture.captureBaseline(); if (!baseline) return;
    pendingBaseline.current = baseline; setScreen('ready');
  }, [screen, posture.snapshot.baselineReady, posture.captureBaseline]);
  useEffect(() => {
    if (screen !== 'ready' || !collection) return;
    const timer = setTimeout(() => {
      const baseline = pendingBaseline.current;
      if (!baseline || live.current?.status === 'completed' || live.current?.status === 'interrupted') return;
      if (live.current?.status === 'recalibrating') endCalibration(live.current, baseline);
      else live.current = createSession(crypto.randomUUID(), settings.current, collection.generation, baseline);
      refresh(); checkpoint(); setScreen('active');
    }, 1000);
    return () => clearTimeout(timer);
  }, [screen, collection, checkpoint, refresh]);
  useEffect(() => { if (screen !== 'calibrate') return; const timeout = setTimeout(() => { if (stageRef.current === 'calibrate' && performance.now() - calibrationAt.current >= 30_000) { setNotice('姿勢を登録できませんでした。カメラの位置を確認して、もう一度お試しください。'); cancelRegistration(); } }, 30_100); return () => clearTimeout(timeout); }, [screen, calibrationNonce]);

  async function start(timer: Settings, remember: boolean) {
    setBusy(true); setError('');
    try {
      const release = await acquireMeasurementLock();
      if (!mounted.current) { release?.(); return; }
      if (!release) throw new Error('別のタブで測定中です。その測定を終了してから、もう一度お試しください。');
      releaseOwner.current = release;
      setCollection(await enqueue(() => repository.current!.timer(remember ? timer : null)));
      settings.current = timer; live.current = null; setSession(null); primeRecoverySound(); setScreen('prepare');
    } catch (cause) { releaseMeasurement(); report(cause); }
    finally { setBusy(false); }
  }

  async function openCard(card: Card) { try { const record = await repository.current!.session(card.measurementId); if (!record) throw new Error('このカードの測定記録が見つかりません'); setDetail(record); } catch (cause) { report(cause); } }
  async function reset() { setBusy(true); try { const value = await enqueue(() => repository.current!.reset()); setDetail(null); setCollection(value); setDialog(null); } catch (cause) { report(cause); } finally { setBusy(false); } }
  function finish() { const current = live.current; if (!current) return; advanceWithRestCue(current, performance.now(), screen === 'active' ? reading() : NO_READING, playRecoverySound); if (current.status !== 'completed') finishSession(current, undefined, reading()); refresh(); void finalize(); }
  function home() { releaseMeasurement(); live.current = null; setSession(null); setScreen('home'); }
  if (!collection) return <main className="work-app work-loading"><Brand /><p role="status">{error || '記録を読み込んでいます…'}</p>{error && <button className="work-button white" onClick={() => location.reload()}>再読み込み</button>}</main>;
  return <div className="work-app" aria-busy={busy}>
    <DesktopUpdater canInstall={screen === 'home' && !busy && !dialog && !detail} />
    {screen === 'story' && <OnboardingStoryScreen onComplete={() => { saveOnboardingStoryCompleted(); setScreen('home'); }} />}
    {screen === 'home' && <Home collection={collection} onStart={() => setScreen('timer')} onPick={() => setScreen('picker')} onCard={card => void openCard(card)} onReset={() => setDialog('reset')} onStory={() => setScreen('story')} onSound={() => setDialog('sound')} />}
    {screen === 'picker' && <CharacterPicker collection={collection} onClose={home} onConfirm={id => { void enqueue(() => repository.current!.select(id)).then(value => { setCollection(value); home(); }).catch(report); }} />}
    {screen === 'timer' && <TimerSettings saved={collection.timer} onClose={home} onSubmit={(timer, remember) => { if (!busy) void start(timer, remember); }} />}
    {camera && <MeasureScreen widgetEnabled={widgetEnabled} onWidgetChange={setWidgetEnabled} sound={sound} onSoundChange={setSound} stage={screen as MeasureStage} session={session} videoRef={posture.videoRef} canvasRef={posture.canvasRef} status={posture.status} ready={posture.ready} remainingCalibrationMs={posture.snapshot.warmupRemainingMs} tracking={posture.snapshot.qualityOk} onRegister={beginRegistration} onCancel={cancelRegistration} onRecalibrate={beginRegistration} onPause={pause} onFinish={() => setDialog('finish')} />}
    {screen === 'result' && session && <main className="work-screen work-result-screen"><Brand /><h1>{session.acquiredCharacterId ? '新しい仲間がやってきた！' : 'おつかれさまでした！'}</h1><ResultCard session={session} /><button className="work-button blue" onClick={home}>ホームへ戻る</button></main>}
    {!isDesktop && widget && <Widget state={widget} onAction={action} />}
    {detail && <Dialog title="獲得カードの詳細" className="work-detail-dialog" onClose={() => setDetail(null)}><ResultCard session={detail} /></Dialog>}
    {dialog === 'reset' && <Dialog title="コレクションを初期化" onClose={() => !busy && setDialog(null)}><h2>コレクションを初期化しますか？</h2><p>獲得したカードと選択中のピンアナゴをリセットします。測定記録とタイマー設定は残ります。</p><div className="work-dialog-actions"><button className="work-button white" onClick={() => setDialog(null)} disabled={busy}>キャンセル</button><button className="work-button orange" onClick={() => void reset()} disabled={busy}>初期化する</button></div></Dialog>}
    {dialog === 'finish' && <Dialog title="測定を終了" onClose={() => !busy && setDialog(null)}><h2>測定を終了しますか？</h2><p>ここまでの集中時間と姿勢を記録します。</p><div className="work-dialog-actions"><button className="work-button white" disabled={busy} onClick={() => setDialog(null)}>続ける</button><button className="work-button orange" disabled={busy} onClick={finish}>終了する</button></div></Dialog>}
    {dialog === 'sound' && <SoundSettingsDialog settings={sound} onChange={setSound} onClose={() => setDialog(null)} onPreview={() => void playSoundPreview({ src: sound.selectedSound, volume: sound.volume })} />}
    {(error || notice) && <div className="work-notice" role={error ? 'alert' : 'status'}><span>{error || notice}</span>{error && session?.status === 'completed' && screen !== 'result' && <button disabled={busy} onClick={() => void finalize()}>保存を再試行</button>}<button onClick={() => { setError(''); setNotice(''); }}>閉じる</button></div>}
  </div>;
}
