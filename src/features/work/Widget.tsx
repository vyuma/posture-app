import { useEffect, useState, type CSSProperties } from 'react';
import { WidgetPetRig } from './WidgetPetRig';
import { timeLabel } from './model';
import { WidgetTimerText } from './WidgetTimerText';
import { widgetGeometry, widgetGrowth, widgetMessage, widgetPose } from './widgetPresentation';
import './widget.css';
import { WidgetSpeech } from './WidgetSpeech';
import type { SpeechEvent } from '../posture/feedbackSpeech';
import { speechGeometry } from './widgetPresentation';
export type WidgetState = { sessionId: string; remainingMs: number; durationMs: number; phase: 'focus' | 'rest'; paused: boolean; bad: boolean; badSince: number | null; cycle: number; cycles: number; feedbackVersion?: 1; speech?: SpeechEvent | null };
export type WidgetAction = 'pause' | 'resume' | 'finish' | 'open';
export function Widget({ state, onAction, native = false, onDrag }: { state: WidgetState; onAction: (action: WidgetAction) => void; native?: boolean; onDrag?: () => void }) {
  const [motion, setMotion] = useState({ growth: 0, height: innerHeight, reduced: false });
  const pose = widgetPose(state);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { const next = { growth: widgetGrowth(state, Date.now(), reduced.matches), height: innerHeight, reduced: reduced.matches }; setMotion(previous => previous.growth === next.growth && previous.height === next.height && previous.reduced === next.reduced ? previous : next); };
    update();
    const timer = pose === 'bad' ? setInterval(update, 50) : undefined;
    reduced.addEventListener('change', update); window.addEventListener('resize', update);
    return () => { clearInterval(timer); reduced.removeEventListener('change', update); window.removeEventListener('resize', update); };
  }, [pose, state.badSince, state.bad, state.paused, state.phase]);
  // Reserve room for the shadow and longer, tilted feedback messages.
  const baseGeometry = widgetGeometry(pose, motion.growth, motion.height - (native ? 40 : 60));
  const geometry = state.feedbackVersion === 1 ? speechGeometry(baseGeometry, state.speech?.text ?? '') : baseGeometry;
  const message = widgetMessage(pose, motion.growth);
  const variables = Object.fromEntries(Object.entries(geometry).map(([key, value]) => [`--widget-${key}`, `${value}${['growth'].includes(key) ? '' : key === 'bubbleAngle' ? 'deg' : 'px'}`]));
  const duration = Math.max(1, state.durationMs), remaining = Math.max(0, Math.min(duration, state.remainingMs));
  const time = timeLabel(remaining).padStart(5, '0');
  return <aside className={`work-widget is-${pose}${native ? ' is-native' : ''}${motion.reduced ? ' is-reduced' : ''}`} aria-label="姿勢ウィジェット" style={variables as CSSProperties}>
    <div className="work-widget-character" onPointerDown={event => { if (event.button === 0) onDrag?.(); }}>
      <div className="work-widget-character-shadow"><div className="work-widget-mask"><div className="work-widget-shake"><WidgetPetRig pose={pose} /></div></div></div>
      {state.feedbackVersion === 1 ? <WidgetSpeech bad={pose === 'bad'} event={state.speech ?? null} reduced={motion.reduced} /> : <div className="work-widget-speech"><span key={message}>{message}</span></div>}
    </div>
    <div className="work-widget-bar">
      <button className={`work-widget-time${time.length > 5 ? ' is-long' : ''}`} onClick={() => onAction('open')} aria-label={`${state.paused ? '一時停止中' : state.phase === 'rest' ? '休憩中' : '集中中'}、残り${time}、${state.cycle} / ${state.cycles} サイクル。メイン画面を開く`}><WidgetTimerText time={time} /></button>
      <button className="work-widget-toggle" aria-label={state.paused ? '再開' : '一時停止'} onClick={() => onAction(state.paused ? 'resume' : 'pause')}><img src={`/figma/measure-${state.paused ? 'play' : 'pause'}.svg`} alt="" draggable={false} /></button>
      <button className="work-widget-stop" aria-label="測定終了" onClick={() => onAction('finish')}><img src="/figma/measure-stop.svg" alt="" draggable={false} /></button>
      <progress aria-label="残り時間" value={remaining} max={duration} />
    </div>
  </aside>;
}
