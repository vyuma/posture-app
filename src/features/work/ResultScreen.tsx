import { Brand } from './Home';
import { ResultCard } from './ResultCard';
import type { Session } from './model';
import './result-screen.css';
import { TimelapseEntry } from '../timelapse/TimelapseEntry';
import '../timelapse/timelapse.css';

export function ResultScreen({ session, onHome, onTimelapse }: { session: Session; onHome: () => void; onTimelapse?: () => void }) {
  const acquired = Boolean(session.acquiredCharacterId);
  return <main className="work-screen work-result-screen" data-outcome={acquired ? 'acquired' : 'no-reward'}>
    <Brand />
    <header className="work-result-heading"><p>{acquired ? 'ジャジャーン！' : '残念！'}</p><h1>{acquired ? 'ピンアナゴをゲット！' : 'ゲットならず…'}</h1></header>
    <ResultCard key={session.id} session={session} celebrate={acquired} />
    <div className="work-result-navigation">{onTimelapse && <TimelapseEntry sessionId={session.id} onOpen={onTimelapse} />}<button className="work-button orange" onClick={onHome}>ホーム</button></div>
  </main>;
}
