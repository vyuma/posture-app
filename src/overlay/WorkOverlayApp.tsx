import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Widget, type WidgetState, type WidgetAction } from '../features/work/Widget';
import '../features/work/work.css';
import './work-overlay.css';
export function WorkOverlayApp() {
  const [state, setState] = useState<WidgetState | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false; let stop: (() => void) | undefined;
    void (async () => { const unlisten = await listen<WidgetState | null>('work:widget', event => setState(event.payload)); if (cancelled) { unlisten(); return; } stop = unlisten; const initial = await invoke<WidgetState | null>('work_widget_get'); if (!cancelled) setState(initial); })().catch(() => setError('接続を確認してください'));
    return () => { cancelled = true; stop?.(); };
  }, []);
  async function action(value: WidgetAction) { if (!state) return; try { await invoke('work_widget_action', { sessionId: state.sessionId, action: value }); } catch { setError('メイン画面で操作してください'); } }
  return state ? <><Widget state={state} native onAction={value => void action(value)} onDrag={() => { void invoke('overlay_start_drag').catch(() => setError('移動できませんでした')); }} />{error && <button className="work-overlay-error" onClick={() => void action('open')}>{error}</button>}</> : null;
}
