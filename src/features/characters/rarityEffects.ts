import additions from './characterAdditions.json';
import presets from './rarityEffects.json';

export type RarityEffect = keyof typeof presets;
export function getRarityEffect(id?: string | null): RarityEffect | undefined {
  const preset = additions.find(item => item.id === id)?.presentation.effect;
  return preset && Object.prototype.hasOwnProperty.call(presets, preset) ? preset as RarityEffect : undefined;
}
export const rarityEffects = presets;
