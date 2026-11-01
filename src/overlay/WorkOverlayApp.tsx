import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Widget, type WidgetState, type WidgetAction } from '../features/work/Widget';
import { widgetPose } from '../features/work/widgetPresentation';
import '../features/work/work.css';
import './work-overlay.css';
export function WorkOverlayApp() {
  const [state, setState] = useState<WidgetState | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false; let stop: (() => void) | undefined;
    void (async () => { const unlisten = await listen<WidgetState | null>('work:widget', event => setState(event.payload)); if (cancelled) { unlisten(); return; } stop = unlisten; const initial = await invoke<WidgetState | null>('work_widget_get'); if (!cancelled) setState(initial); })().catch(() => setError('接続を確認してください'));
    return () => { cancelled = true; stop?.(); };
  }, []);
  const pose = state ? widgetPose(state) : null;
  const sessionId = state?.sessionId;
  useEffect(() => {
    if (!sessionId || pose === 'bad') return;
    // bad→good spans 75 frames (2.5s); leave room for the final render.
    const timer = window.setTimeout(() => { void invoke('work_widget_compact', { sessionId }).catch(() => setError('表示サイズを調整できませんでした')); }, 3100);
    return () => clearTimeout(timer);
  }, [pose, sessionId]);
  async function action(value: WidgetAction) { if (!state) return; try { await invoke('work_widget_action', { sessionId: state.sessionId, action: value }); } catch { setError('メイン画面で操作してください'); } }
  return state ? <><Widget state={state} native onAction={value => void action(value)} onDrag={() => { void invoke('overlay_start_drag').catch(() => setError('移動できませんでした')); }} />{error && <button className="work-overlay-error" onClick={() => void action('open')}>{error}</button>}</> : null;
}
