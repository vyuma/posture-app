import { normalizeJudgment } from '../posture/judgment';
import './timer-settings.css';
import { t, useAppLanguage } from "../i18n";
import { useState, type CSSProperties } from 'react';
import { clampTimerValue, DEFAULT_TIMER, normalizeTimer, TIMER_MAX, timerValid, type TimerSettings as Settings } from './model';
import { Brand } from './Home';

const controls = [
  { key: 'focusMinutes', label: '集中', unit: '分' },
  { key: 'restMinutes', label: '休憩', unit: '分' },
  { key: 'cycles', label: 'サイクル', unit: '周' },
] as const;

export function TimerSettings({ saved, onSubmit, onClose }: { saved: Settings | null; onSubmit: (settings: Settings, remember: boolean) => void; onClose: () => void }) {
  useAppLanguage();
  const [timer, setTimer] = useState(() => normalizeTimer(saved ?? DEFAULT_TIMER));
  const [remember, setRemember] = useState(!!saved);

  const judgment = normalizeJudgment(timer.posture);

  function change(key: keyof typeof TIMER_MAX, value: number) {
    setTimer(current => {
      const next = { ...current, [key]: value };
      if (next.cycles === 1) next.restMinutes = 0;
      else if (key === 'cycles' && current.cycles === 1) next.restMinutes = 1;
      return next;
    });
  }

  return <main className="work-screen work-timer-screen">
    <Brand />
    <button className="work-close screen-close" onClick={onClose} aria-label={t("ホームへ戻る")}><img src="/figma/timelapse-close.svg" alt="" /></button>
    <form className="work-glass work-timer-panel" noValidate onSubmit={event => {
      event.preventDefault();
      const corrected = normalizeTimer({...timer,posture:judgment});
      setTimer(corrected);
      onSubmit(corrected, remember);
    }}>
      <div className="work-timer-heading"><h1>{t("設定")}</h1><p>{t("姿勢測定時の設定をしましょう。")}</p></div>
      <div className="work-judgment-controls">
        <div className="work-setting-group work-judgment-level" role="radiogroup" aria-labelledby="timer-judgment-title"><span id="timer-judgment-title" className="work-setting-title">{t("判定基準")}</span>
          <div className="work-setting-options">{([['easy','やさしい'],['normal','ふつう'],['hard','きびしい']] as const).map(([value,label]) =>
            <label key={value}><input type="radio" name="judgment" value={value} checked={judgment.difficulty === value}
              onChange={() => setTimer(current => ({...current,posture:{...judgment,difficulty:value}}))}/><span>{t(label)}</span></label>)}</div>
        </div>
        <div className="work-setting-group work-monitor-choice" role="radiogroup" aria-labelledby="timer-monitor-title"><span id="timer-monitor-title" className="work-setting-title">{t("使用モニター")}</span>
          <div className="work-setting-options">{([[false,'1台'],[true,'2台以上']] as const).map(([value,label]) =>
            <label key={label}><input type="radio" name="monitors" checked={judgment.dualMonitor === value}
              onChange={() => setTimer(current => ({...current,posture:{...judgment,dualMonitor:value}}))}/><span>{t(label)}</span></label>)}</div>
        </div>
      </div>
      <div className="work-timer-controls">
        {controls.map(({ key, label, unit }) => {
          const restLocked = key === 'restMinutes' && timer.cycles === 1;
          const value = restLocked ? 0 : timer[key];
          const sliderValue = Math.max(5, Math.min(TIMER_MAX[key], Number.isNaN(value) ? 5 : value));
          const progress = restLocked ? 0 : (sliderValue - 5) / (TIMER_MAX[key] - 5) * 100;
          const digits = Number.isNaN(value) ? 1 : Math.min(3, String(value).length);
          return <div className={`work-timer-control ${key}`} key={key} data-rest-locked={restLocked}>
            <label htmlFor={`timer-${key}`}>{t(label)}</label>
            <div className="work-number" style={{ '--timer-digits': digits } as CSSProperties}>
              <input id={`timer-${key}`} aria-label={`${t(label)} ${unit === '分' ? t("時間（分）") : t("数")}`}
                type="number" inputMode="numeric" min={restLocked ? 0 : 1} max={restLocked ? 0 : TIMER_MAX[key]} step="1"
                readOnly={restLocked} aria-describedby={restLocked ? 'timer-no-rest' : undefined}
                value={Number.isNaN(value) ? '' : value}
                onChange={event => change(key, event.target.value === '' ? NaN : Number(event.target.value))}
                onBlur={event => change(key, clampTimerValue(key, event.target.value === '' ? NaN : Number(event.target.value)))} />
              <span>{t(unit)}</span>
            </div>
            {key !== 'cycles' ? <input className="work-timer-range" style={{ '--timer-progress': `${progress}%` } as CSSProperties}
              type="range" aria-label={t("{0}時間をスライダーで調整", { 0: t(label) })} min={restLocked ? 0 : 5} max={restLocked ? 0 : TIMER_MAX[key]}
              step="5" disabled={restLocked} value={restLocked ? 0 : sliderValue}
              onChange={event => change(key, Number(event.target.value))}
              onPointerUp={event => change(key, Number(event.currentTarget.value))}
              onKeyUp={event => { if (['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) change(key, Number(event.currentTarget.value)); }} />
              : <div className="work-steppers">
                <button type="button" aria-label={t("サイクルを減らす")} disabled={timer.cycles <= 1} onClick={() => change(key, clampTimerValue(key, timer.cycles - 1))}><img src="/figma/timer-down.svg" alt="" /></button>
                <button type="button" aria-label={t("サイクルを増やす")} disabled={timer.cycles >= TIMER_MAX.cycles} onClick={() => change(key, clampTimerValue(key, timer.cycles + 1))}><img src="/figma/timer-up.svg" alt="" /></button>
              </div>}
          </div>;
        })}
      </div>
      <p id="timer-no-rest" className="work-timer-hint">{t("1周のときは休憩なし（0分）です。")}</p>
      <button className="work-button blue" type="submit" disabled={!timerValid(timer)}>{t("設定完了")}</button>
      <label className="work-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span>{t("次回もこの設定にする")}</span></label>
    </form>
  </main>;
}
