import type { ReactNode } from 'react';
import { t, useAppLanguage } from '../i18n';
import './posture-guide.css';
const labels = [
  ['40cm以上',149.29,54,70,'distance'], ['顎をひく',172.54,92.99,75,''],
  ['背筋は伸ばす',354.3,124.7,108,''], ['約90°',207.41,143.72,34,'angle'],
  ['約90°',108.08,210.29,34,'angle'], ['仙骨は座面に',346.9,221.92,128.93,''],
  ['地面につける',0,349.98,108,'feet'],
] as const;
export function PostureGuide({ children }: { children: ReactNode }) {
  const language=useAppLanguage();
  return <div className="work-posture-check">
    <div className="work-posture-camera-column">
      <p className="work-posture-framing-instruction">
        <img src="/figma/posture-check-warning.svg" width="27" height="27" alt="" aria-hidden="true" />
        <span>{t('姿勢を正して、肩を画面内に収めてください。')}</span>
      </p>
      {children}
    </div>
    <div className="work-posture-help">
      <h2>{t('姿勢の正し方')}</h2>
      <div className="work-posture-illustration" data-language={language}>
        <img src="/figma/posture-check-guide.png" alt={t('画面から40cm以上離れ、顎を引き、背筋を伸ばす。膝と肘は約90度、足を床につける。')} />
        {language !== 'ja' && <div className="work-posture-guide-labels" aria-hidden="true">{labels.map(([text,x,y,width,tone]) =>
          <span key={text+x} className={tone} style={{left:`${x/475.83*100}%`,top:`${y/398*100}%`,width:`${width/475.83*100}%`}}>{t(text)}</span>)}</div>}
      </div>
    </div>
  </div>;
}
