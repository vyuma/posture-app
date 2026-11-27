import { t, useAppLanguage } from "../i18n";
import { useEffect, useState, type CSSProperties } from 'react';
import { WidgetPetRig } from './WidgetPetRig';
import { timeLabel } from './model';
import { WidgetTimerText } from './WidgetTimerText';
import { widgetGeometry, widgetGrowth, widgetMessage, widgetPose } from './widgetPresentation';
import './widget.css';
import { WidgetSpeech } from './WidgetSpeech';
import type { SpeechEvent } from '../posture/feedbackSpeech';
import { useWidgetDrag } from './useWidgetDrag';
import { widgetBounds } from './widgetPosition';
import { speechGeometry } from './widgetPresentation';
export type WidgetState = { sessionId: string; remainingMs: number; durationMs: number; phase: 'focus' | 'rest'; paused: boolean; bad: boolean; badSince: number | null; cycle: number; cycles: number; feedbackVersion?: 1; speech?: SpeechEvent | null };
export type WidgetAction = 'pause' | 'resume' | 'finish' | 'open';
export function Widget({ state, onAction, native = false, onDrag }: { state: WidgetState; onAction: (action: WidgetAction) => void; native?: boolean; onDrag?: () => void }) {
  useAppLanguage();
  const [motion, setMotion] = useState({ growth: 0, height: innerHeight, width: innerWidth, reduced: false });
  const pose = widgetPose(state);
  const [displayedText, setDisplayedText] = useState(t(state.speech?.text ?? ''));
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { const next = { growth: widgetGrowth(state, Date.now(), reduced.matches), height: innerHeight, width: innerWidth, reduced: reduced.matches }; setMotion(previous => previous.growth === next.growth && previous.height === next.height && previous.width === next.width && previous.reduced === next.reduced ? previous : next); };
    update();
    const timer = pose === 'bad' ? setInterval(update, 50) : undefined;
    reduced.addEventListener('change', update); window.addEventListener('resize', update);
    return () => { clearInterval(timer); reduced.removeEventListener('change', update); window.removeEventListener('resize', update); };
  }, [pose, state.badSince, state.bad, state.paused, state.phase]);
  // Reserve room for the shadow and longer, tilted feedback messages.
  const baseGeometry = widgetGeometry(pose, motion.growth, motion.height - (native ? 40 : 60), motion.width);
  const geometry = state.feedbackVersion === 1 ? speechGeometry(baseGeometry, displayedText) : baseGeometry;
  const drag = useWidgetDrag(!native, widgetBounds(pose, geometry), () => onAction('open'), onDrag);
  const message = t(widgetMessage(pose, motion.growth));
  const variables = Object.fromEntries(Object.entries(geometry).filter(([, value]) => Number.isFinite(value)).map(([key, value]) => [`--widget-${key}`, `${value}${['growth'].includes(key) ? '' : key === 'bubbleAngle' ? 'deg' : 'px'}`]));
  const duration = Math.max(1, state.durationMs), remaining = Math.max(0, Math.min(duration, state.remainingMs));
  const time = timeLabel(remaining).padStart(5, '0');
  return <aside className={`work-widget is-${pose}${native ? ' is-native' : ''}${motion.reduced ? ' is-reduced' : ''}${drag.dragging ? ' is-dragging' : ''}`} aria-label={t("姿勢ウィジェット")} style={{ ...variables, ...drag.style } as CSSProperties}>
    <div className="work-widget-character" tabIndex={0} role="button"
      aria-label={native ? t("メイン画面を開く") : `${t("メイン画面を開く")}。${t("ウィジェットを移動。ドラッグまたは矢印キー、Shiftで大きく移動")}`}
      {...drag.handlers} onClick={event => { if (event.detail === 0) onAction('open'); }}>
      <div className="work-widget-character-shadow"><div className="work-widget-mask"><div className="work-widget-shake"><WidgetPetRig pose={pose} /></div></div></div>
      {state.feedbackVersion === 1 ? <WidgetSpeech onDisplayText={setDisplayedText} geometry={geometry} bad={pose === 'bad'} event={state.speech ?? null} reduced={motion.reduced} /> : <div className="work-widget-speech"><span key={message}>{message}</span></div>}
    </div>
    <div className="work-widget-bar" onClick={event => { if (!(event.target as Element).closest('button')) onAction('open'); }}>
      <button className={`work-widget-time${time.length > 5 ? ' is-long' : ''}`} onClick={() => onAction('open')} aria-label={t("{0}、残り{1}、{2} / {3} サイクル。メイン画面を開く", { 0: state.paused ? t("一時停止中") : state.phase === 'rest' ? t("休憩中") : t("集中中"), 1: time, 2: state.cycle, 3: state.cycles })}><WidgetTimerText time={time} /></button>
      <button className="work-widget-toggle" aria-label={state.paused ? t("再開") : t("一時停止")} onClick={() => onAction(state.paused ? 'resume' : 'pause')}><img src={`/figma/measure-${state.paused ? 'play' : 'pause'}.svg`} alt="" draggable={false} /></button>
      <button className="work-widget-stop" aria-label={t("測定終了")} onClick={() => onAction('finish')}><img src="/figma/measure-stop.svg" alt="" draggable={false} /></button>
      <progress aria-label={t("残り時間")} value={remaining} max={duration} />
    </div>
  </aside>;
}
