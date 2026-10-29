import { useEffect, useState } from 'react';
import type { Clip } from './model';
import { openTimelapseStore } from './platform';
import type { TimelapseStore } from './storage';
export const notifyClipsChanged = () => window.dispatchEvent(new Event('piiin:timelapse-change'));
export function useClip(id: string, provided?: TimelapseStore) {
  const [clip, setClip] = useState<Clip | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const update = async () => { try { const store = provided ?? await openTimelapseStore(); const value = await store.get(id); if (active) { setClip(value); setError(''); } } catch { if (active) { setClip(null); setError('動画の記録を読み込めませんでした'); } } };
    setClip(undefined); void update(); const timer = setInterval(() => void update(), 1500);
    window.addEventListener('piiin:timelapse-change', update);
    return () => { active = false; clearInterval(timer); window.removeEventListener('piiin:timelapse-change', update); };
  }, [id, provided]);
  return { clip, error };
}
