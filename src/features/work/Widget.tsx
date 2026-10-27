import { useEffect, useState } from 'react';
import { PetRig } from './PetRig';
import { Icon } from './Dialog';
import { timeLabel } from './model';
export type WidgetState = { sessionId: string; remainingMs: number; durationMs: number; phase: 'focus' | 'rest'; paused: boolean; bad: boolean; badSince: number | null; cycle: number; cycles: number };
export type WidgetAction = 'pause' | 'resume' | 'finish' | 'open';
export function Widget({ state, onAction, native = false, onDrag }: { state: WidgetState; onAction: (action: WidgetAction) => void; native?: boolean; onDrag?: () => void }) {
  const [growth, setGrowth] = useState(0);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setGrowth(reduced.matches || !state.bad || !state.badSince ? 0 : Math.min(1, Math.max(0, Date.now() - state.badSince) / 5000));
    update();
    const timer = state.bad ? setInterval(update, 100) : undefined;
    reduced.addEventListener('change', update);
    return () => { clearInterval(timer); reduced.removeEventListener('change', update); };
  }, [state.bad, state.badSince]);
  return <aside className={`work-widget${state.bad ? ' is-bad' : ''}${native ? ' is-native' : ''}`} aria-label="姿勢ウィジェット" style={{ '--pet-growth': growth } as React.CSSProperties}><div className="work-widget-pet" onPointerDown={onDrag}><PetRig pose={state.bad ? 'bad' : state.phase === 'rest' || state.paused ? 'paused' : 'good'} /></div><div className="work-widget-bar"><button className="work-widget-time" onClick={() => onAction('open')}><small>{state.paused ? '一時停止中' : state.phase === 'rest' ? '休憩中' : '集中'} {state.cycle}/{state.cycles}</small><b>{timeLabel(state.remainingMs)}</b></button><button aria-label={state.paused ? '再開' : '一時停止'} onClick={() => onAction(state.paused ? 'resume' : 'pause')}><Icon name={state.paused ? 'play' : 'pause'} /></button><button aria-label="測定終了" onClick={() => onAction('finish')}><Icon name="stop" /></button><progress aria-label="残り時間" value={state.remainingMs} max={state.durationMs} /></div></aside>;
}
