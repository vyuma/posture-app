import { useCallback, useState } from 'react';
import { AcquisitionIntro } from './AcquisitionIntro';
import { Brand } from './Home';
import { ResultCard } from './ResultCard';
import type { Session } from './model';
import './result-screen.css';
import { TimelapseEntry } from '../timelapse/TimelapseEntry';
import '../timelapse/timelapse.css';
import type { TimelapseStore } from '../timelapse/storage';

export function ResultScreen({ session, onHome, onTimelapse, timelapseStore }: { session: Session; onHome: () => void; onTimelapse?: () => void; timelapseStore?: TimelapseStore }) {
  const acquired = Boolean(session.acquiredCharacterId);
  const [introDone, setIntroDone] = useState(false);
  const completeIntro = useCallback(() => setIntroDone(true), []);
  if (!introDone && session.acquiredCharacterId && session.acquiredCharacterId !== 'normal-nago') return <AcquisitionIntro characterId={session.acquiredCharacterId} onComplete={completeIntro} />;
  return <main className="work-screen work-result-screen" data-outcome={acquired ? 'acquired' : 'no-reward'}>
    <Brand />
    <header className="work-result-heading"><p>{acquired ? 'ジャジャーン！' : '残念！'}</p><h1>{acquired ? 'ピンアナゴをゲット！' : 'ゲットならず…'}</h1></header>
    <ResultCard key={session.id} session={session} celebrate={acquired} />
    <div className="work-result-navigation">{onTimelapse && <TimelapseEntry sessionId={session.id} onOpen={onTimelapse} store={timelapseStore} />}<button className="work-button orange" onClick={onHome}><img className="work-result-home-icon" src="/figma/timelapse-home.svg" alt="" />ホームに戻る</button></div>
  </main>;
}
