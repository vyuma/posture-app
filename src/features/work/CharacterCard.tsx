import type { CSSProperties } from 'react';
import { CHARACTER_CATALOG } from '../characters/characterCatalog';
import { CharacterStars } from '../characters/CharacterStars';
import presentation from './characterPresentation.json';

export const catalog = CHARACTER_CATALOG;
export const character = (id?: string | null) => catalog.find(item => item.id === id) ?? catalog[0];
export const numberOf = (id: string) => String(catalog.findIndex(item => item.id === id) + 1).padStart(3, '0');
export function characterStyle(id: string): CSSProperties {
  const design = presentation[id as keyof typeof presentation] ?? presentation['normal-nago'];
  return { '--character-color': design.color, '--character-bg': design.background, '--art-width': `${design.artWidth}%`, '--art-top': `${design.artTop}%` } as CSSProperties;
}
export function Portrait({ id, className = '' }: { id: string; className?: string }) {
  const item = character(id);
  return <img className={`work-portrait ${className}`} data-character={id} src={item.portraitSrc} alt={item.name} draggable={false} />;
}
export function CharacterCard({ id, index, onClick, selected = false }: { id?: string; index: number; onClick?: () => void; selected?: boolean }) {
  const item = id ? character(id) : null;
  const content = <>{item ? <><div className="work-card-art"><Portrait id={item.id} /></div><div className="work-card-copy"><div className="work-card-name"><strong>{item.name}</strong><CharacterStars characterId={item.id} /></div><span className="work-tags">{item.personalityTags?.map(tag => <span key={tag}>{tag}</span>)}</span></div></> : <span className="work-locked-mark" aria-hidden="true">{String(index + 1).padStart(3, '0')}</span>}</>;
  return onClick ? <button type="button" className={`work-card${selected ? ' is-selected' : ''}`} style={id ? characterStyle(id) : undefined} onClick={onClick} aria-label={`${item?.name}の${selected ? '選択中の' : ''}カード`} aria-pressed={selected || undefined}>{content}</button>
    : <div className="work-card is-locked" aria-label={`${index + 1}番 未獲得`}>{content}</div>;
}
