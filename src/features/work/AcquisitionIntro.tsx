import { useEffect, useState } from 'react';
import { Brand } from './Brand';
import { Portrait } from './CharacterCard';
import './acquisition-intro.css';

export function AcquisitionIntro({ characterId, onComplete }: { characterId: string; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    // Give each message its full reading time, including after returning to the tab.
    let timer: number;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(() => step === 0 ? setStep(1) : onComplete(), step === 0 ? 3000 : 2600);
    };
    schedule(); document.addEventListener('visibilitychange', schedule);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', schedule); };
  }, [step, onComplete]);
  return <main className="acquisition-intro">
    <Brand />
    <button className="acquisition-skip" onClick={onComplete}>▶︎ スキップする</button>
    <section key={step} className={`acquisition-scene scene-${step}`} aria-live="polite">
      <div className="acquisition-copy">{step === 0 && <p>今日はすごく姿勢が良かったね。</p>}<h1>{step === 0 ? '新しい仲間を連れてきたよ！' : 'はじめまして、よろしくナ！'}</h1></div>
      <div className="acquisition-character"><Portrait id={step === 0 ? 'normal-nago' : characterId} /></div>
    </section>
  </main>;
}
