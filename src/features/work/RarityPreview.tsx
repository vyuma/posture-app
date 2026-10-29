/** QA only: deterministic cards without touching stored collections or measurements. */
import { useState } from 'react';
import { CharacterCard } from './CharacterCard';
import { ResultCard } from './ResultCard';
import type { Session } from './model';

export function RarityPreview({ session }: { session: Session }) {
  const [id, setId] = useState('sakura-nago');
  const [celebrate, setCelebrate] = useState(false);
  const [run, setRun] = useState(0);
  return <main style={{padding:'80px 24px',minHeight:'100dvh',background:'#e9eef2'}}>
    <div className="work-home" style={{maxWidth:1000,margin:'0 auto 24px'}}>
      <div className="work-card-grid" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:16}}>
        {['sakura-nago','miira-nago','king-nago'].map((value,index)=><CharacterCard key={value} id={value} index={index} onClick={()=>{setId(value);setRun(run+1);}} />)}
      </div>
    </div>
    <nav aria-label="演出の検証" style={{display:'flex',justifyContent:'center',gap:12,marginBottom:24}}>
      <button onClick={()=>{setCelebrate(false);setRun(run+1);}}>詳細の演出を再生</button>
      <button onClick={()=>{setCelebrate(true);setRun(run+1);}}>獲得の演出を再生</button>
    </nav>
    <ResultCard key={`${id}-${run}`} session={{...session,id:`rarity-${run}`,acquiredCharacterId:id}} variant={celebrate ? 'result' : 'collection'} celebrate={celebrate} />
  </main>;
}
