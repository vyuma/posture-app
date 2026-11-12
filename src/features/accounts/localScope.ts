let space = 'legacy';
let owner = 'guest';
export function activeOwner() { return owner; }
export function setActiveOwner(value:string) { owner=value; }
export const activeSpace = () => space;
export function setActiveSpace(value: string) {
  if (value !== 'legacy' && !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid local profile');
  space = value;
}
export const scopedKey = (key: string) => space === 'legacy' ? key : `piiin.profile.${space}.${key}`;
export const scopedDatabase = (base: string, scope = space) => scope === 'legacy' ? base : `${base}-${scope}`;
