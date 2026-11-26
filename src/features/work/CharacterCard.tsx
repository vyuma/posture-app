import { t, useAppLanguage } from "../i18n";
import additions from "../characters/characterAdditions.json";
import type { CSSProperties } from 'react';
import { CHARACTER_CATALOG } from '../characters/characterCatalog';
import { CharacterStars } from '../characters/CharacterStars';
import presentation from './characterPresentation.json';

import { RarityBackdrop, RarityFrame, RarityPortrait, rarityStyle } from '../characters/RarityArt';
import { getRarityEffect } from '../characters/rarityEffects';

export const catalog = CHARACTER_CATALOG;
export const character = (id?: string | null) => {
  const item = catalog.find(item => item.id === id) ?? catalog[0];
  return { ...item, name: t(item.name), story: t(item.story ?? ''), personalityTags: item.personalityTags?.map(tag => t(tag)) };
};
export const numberOf = (id: string) => String(catalog.find(item => item.id === id)?.number ?? 0).padStart(3, '0');
export function characterSpeech(id: string): string {
  const design: { pickerSpeech?: string } | undefined = additions.find(item => item.id === id)?.presentation ?? presentation[id as keyof typeof presentation];
  return t(design?.pickerSpeech?.trim() || presentation['normal-nago'].pickerSpeech);
}
export function characterStyle(id: string): CSSProperties {
  const design = additions.find(item => item.id === id)?.presentation ?? presentation[id as keyof typeof presentation] ?? presentation['normal-nago'];
  return { '--character-color': design.color, '--character-bg': design.background, '--art-width': `${design.artWidth}%`, '--art-top': `${design.artTop}%` } as CSSProperties;
}
export function Portrait({ id, className = '' }: { id: string; className?: string }) {
  useAppLanguage();
  const item = character(id);
  return <img className={`work-portrait ${className}`} data-character={id} src={item.portraitSrc} alt={item.name} draggable={false} />;
}
export function CharacterCard({ id, index, onClick, selected = false }: { id?: string; index: number; onClick?: () => void; selected?: boolean }) {
  useAppLanguage();
  const item = id ? character(id) : null;
  const effect = getRarityEffect(id);
  const content = <>{item ? <><div className="work-card-art">{effect && <RarityBackdrop effect={effect} />}{effect ? <RarityPortrait id={item.id} src={item.portraitSrc} name={item.name} /> : <Portrait id={item.id} />}</div><div className="work-card-copy"><div className="work-card-name"><strong>{item.name}</strong><CharacterStars characterId={item.id} /></div><span className="work-tags">{item.personalityTags?.map(tag => <span key={tag}>{tag}</span>)}</span></div></> : <span className="work-locked-mark" aria-hidden="true">{String(index + 1).padStart(3, '0')}</span>}</>;
  return onClick ? <button type="button" data-rarity-effect={effect} className={`work-card${selected ? ' is-selected' : ''}`} style={id ? { ...characterStyle(id), ...rarityStyle(id) } : undefined} onClick={onClick} aria-label={t("{0}の{1}カード", { 0: item?.name, 1: selected ? t("選択中の") : '' })} aria-pressed={selected || undefined}>{content}{effect && <RarityFrame effect={effect} />}</button>
    : <div className="work-card is-locked" aria-label={t("{0}番 未獲得", { 0: index + 1 })}>{content}</div>;
}
