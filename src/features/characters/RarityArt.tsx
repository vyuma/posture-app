import { useId, useMemo, type CSSProperties } from 'react';
import sakura from './motion/sakura-nago.svg?raw';
import miira from './motion/miira-nago.svg?raw';
import king from './motion/king-nago.svg?raw';
import { getRarityEffect, rarityEffects, type RarityEffect } from './rarityEffects';
import './rarity-effects.css';

const rigs = { sakura, miira, king };
const petal = 'M0 0C7-5 17-2 16 4C15 10 5 12 0 0Z';
export function rarityStyle(id: string): CSSProperties {
  const effect = getRarityEffect(id);
  if (!effect) return {};
  const timing = rarityEffects[effect];
  return { '--rarity-hover': `${timing.hoverMs}ms`, '--rarity-detail': `${timing.detailMs}ms`, '--rarity-acquisition': `${timing.acquisitionMs}ms`, '--rarity-star-delay': `${timing.starDelayMs}ms` } as CSSProperties;
}

/** Exact supplied SVG paths; only the semantic groups added by the build script move. */
export function RarityPortrait({ id, src, name }: { id: string; src: string; name: string }) {
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const effect = getRarityEffect(id)!;
  const svg = useMemo(() => rigs[effect].replace(/__INSTANCE__/g, `rarity-${instance}-`), [effect, instance]);
  return <span className="work-portrait rarity-portrait" data-character={id} role="img" aria-label={name}>
    <img src={src} alt="" draggable={false} data-rarity-export-portrait />
    <span className="rarity-rig-layer" aria-hidden="true" data-export-exclude dangerouslySetInnerHTML={{ __html: svg }} />
  </span>;
}

export function RarityBackdrop({ effect }: { effect: RarityEffect }) {
  return <>
    <svg className={`rarity-backdrop rarity-backdrop--${effect}`} viewBox="0 0 300 300" aria-hidden="true" focusable="false">
      {effect === 'sakura' ? [[24,49,-25],[252,32,24],[263,156,75],[30,218,-16],[235,267,32]].map(([x,y,r],i) => <path key={i} d={petal} transform={`translate(${x} ${y}) rotate(${r}) scale(${i%2 ? 1.1 : .8})`} fill="#d981af" opacity=".25" />)
        : effect === 'miira' ? Array.from({length:12},(_,i)=><circle key={i} cx={18+(i*67)%265} cy={25+(i*83)%265} r={i%3+1} fill="#b6a385" opacity=".32" />)
        : <><circle cx="150" cy="115" r="104" fill="#fff8de" opacity=".45" />{Array.from({length:10},(_,i)=><path key={i} d="M147 9L153 9L160 70L140 70Z" fill="#e6bd54" opacity=".16" transform={`rotate(${i*36} 150 115)`} />)}</>}
    </svg>
    <span className={`rarity-particles rarity-particles--${effect}`} aria-hidden="true" data-export-exclude>
      {Array.from({length: effect === 'miira' ? 8 : 5},(_,i)=><svg key={i} viewBox="-6 -8 30 30" style={{'--particle-index':i,'--particle-x':`${12+(i*19)%80}%`,'--particle-y':`${9+(i*23)%73}%`,'--particle-turn':`${i%2 ? 70 : -55}deg`} as CSSProperties}>
        {effect === 'sakura' ? <path d={petal} fill={i%2 ? '#e9adcc' : '#d981af'} /> : effect === 'miira' ? <circle cx="8" cy="8" r="2" fill="#b6a385" /> : <path d="M8-3L11 5L19 8L11 11L8 19L5 11L-3 8L5 5Z" fill="#fff8df" />}
      </svg>)}
    </span>
    {effect === 'miira' && <span className="rarity-wrappings" aria-hidden="true" data-export-exclude>{[0,1,2,3].map(i=><i key={i} style={{'--band-index':i} as CSSProperties} />)}</span>}
  </>;
}

export function RarityFrame({ effect }: { effect: RarityEffect }) {
  return <span className={`rarity-frame rarity-frame--${effect}`} aria-hidden="true">
    <span className="rarity-frame-glint" data-export-exclude />
  </span>;
}
