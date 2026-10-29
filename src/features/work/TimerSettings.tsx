import { useState, type CSSProperties } from 'react';
import { clampTimerValue, DEFAULT_TIMER, normalizeTimer, TIMER_MAX, timerValid, type TimerSettings as Settings } from './model';
import { Brand } from './Home';
import { Icon } from './Dialog';

const controls = [
  { key: 'focusMinutes', label: '集中', unit: '分' },
  { key: 'restMinutes', label: '休憩', unit: '分' },
  { key: 'cycles', label: 'サイクル', unit: '周' },
] as const;

export function TimerSettings({ saved, onSubmit, onClose }: { saved: Settings | null; onSubmit: (settings: Settings, remember: boolean) => void; onClose: () => void }) {
  const [timer, setTimer] = useState(() => normalizeTimer(saved ?? DEFAULT_TIMER));
  const [remember, setRemember] = useState(!!saved);

  function change(key: keyof Settings, value: number) {
    setTimer(current => {
      const next = { ...current, [key]: value };
      if (next.cycles === 1) next.restMinutes = 0;
      else if (key === 'cycles' && current.cycles === 1) next.restMinutes = 1;
      return next;
    });
  }

  return <main className="work-screen work-timer-screen">
    <Brand />
    <button className="work-close screen-close" onClick={onClose} aria-label="ホームへ戻る"><img src="/figma/timelapse-close.svg" alt="" /></button>
    <form className="work-glass work-timer-panel" noValidate onSubmit={event => {
      event.preventDefault();
      const corrected = normalizeTimer(timer);
      setTimer(corrected);
      onSubmit(corrected, remember);
    }}>
      <h1>タイマーを設定</h1>
      <div className="work-timer-controls">
        {controls.map(({ key, label, unit }) => {
          const restLocked = key === 'restMinutes' && timer.cycles === 1;
          const value = restLocked ? 0 : timer[key];
          const sliderValue = Math.max(5, Math.min(TIMER_MAX[key], Number.isNaN(value) ? 5 : value));
          const progress = restLocked ? 0 : (sliderValue - 5) / (TIMER_MAX[key] - 5) * 100;
          const digits = Number.isNaN(value) ? 1 : Math.min(3, String(value).length);
          return <div className={`work-timer-control ${key}`} key={key} data-rest-locked={restLocked}>
            <label htmlFor={`timer-${key}`}>{label}</label>
            <div className="work-number" style={{ '--timer-digits': digits } as CSSProperties}>
              <input id={`timer-${key}`} aria-label={`${label}${unit === '分' ? '時間（分）' : '数'}`}
                type="number" inputMode="numeric" min={restLocked ? 0 : 1} max={restLocked ? 0 : TIMER_MAX[key]} step="1"
                readOnly={restLocked} aria-describedby={restLocked ? 'timer-no-rest' : undefined}
                value={Number.isNaN(value) ? '' : value}
                onChange={event => change(key, event.target.value === '' ? NaN : Number(event.target.value))}
                onBlur={event => change(key, clampTimerValue(key, event.target.value === '' ? NaN : Number(event.target.value)))} />
              <span>{unit}</span>
            </div>
            {key !== 'cycles' ? <input className="work-timer-range" style={{ '--timer-progress': `${progress}%` } as CSSProperties}
              type="range" aria-label={`${label}時間をスライダーで調整`} min={restLocked ? 0 : 5} max={restLocked ? 0 : TIMER_MAX[key]}
              step="5" disabled={restLocked} value={restLocked ? 0 : sliderValue}
              onChange={event => change(key, Number(event.target.value))}
              onPointerUp={event => change(key, Number(event.currentTarget.value))}
              onKeyUp={event => { if (['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) change(key, Number(event.currentTarget.value)); }} />
              : <div className="work-steppers">
                <button type="button" aria-label="サイクルを減らす" disabled={timer.cycles <= 1} onClick={() => change(key, clampTimerValue(key, timer.cycles - 1))}><Icon name="down" /></button>
                <button type="button" aria-label="サイクルを増やす" disabled={timer.cycles >= TIMER_MAX.cycles} onClick={() => change(key, clampTimerValue(key, timer.cycles + 1))}><Icon name="up" /></button>
              </div>}
          </div>;
        })}
      </div>
      <p id="timer-no-rest" className="work-timer-hint">1周のときは休憩なし（0分）です。</p>
      <button className="work-button blue" type="submit" disabled={!timerValid(timer)}>設定完了</button>
      <label className="work-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span>次回もこの設定にする</span></label>
    </form>
  </main>;
}
