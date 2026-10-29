import type { TimelapseStore } from './storage';
import { useClip } from './useClip';
export function TimelapseEntry({ sessionId, onOpen, compact = false, store }: { sessionId: string; onOpen: () => void; compact?: boolean; store?: TimelapseStore }) {
  const { clip, error } = useClip(sessionId, store);
  const playable = clip && (clip.state === 'ready' || clip.state === 'partial') && clip.bytes > 0;
  const label = clip === undefined ? '読み込み中…' : clip?.state === 'recording' ? '動画を保存中…' : playable ? 'タイムラプスを見る' : 'タイムラプス未記録';
  return <button data-export-exclude className={compact ? 'timelapse-card-entry' : 'work-button white timelapse-result-entry'} disabled={!playable} title={error || clip?.error || (!playable ? 'タイムラプス記録をオンにした測定で利用できます' : undefined)} aria-label={compact ? label : undefined} onClick={onOpen}>
    {compact && <svg aria-hidden="true" viewBox="-0.89865 -0.89865 17.9773 10.7873" fill="none" stroke="currentColor" strokeWidth="1.7973" strokeLinejoin="round"><path d="M0 0 7.19 4.495 0 8.99Z M8.99 0 16.18 4.495 8.99 8.99Z" /></svg>}
    {!compact && playable && <svg className="timelapse-result-icon" aria-hidden="true" viewBox="0 0 38 37" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M5.54 10.03 19.73 18.5 5.54 26.97Z M17.42 10.03 31.61 18.5 17.42 26.97Z" /></svg>}
    {compact ? <span>タイムラプス</span> : <span className={playable ? 'timelapse-result-label' : undefined}>{label}</span>}
  </button>;
}
