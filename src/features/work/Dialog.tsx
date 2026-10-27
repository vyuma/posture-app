import { useLayoutEffect, useRef, type ReactNode } from 'react';
export function Dialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // Keep the original trigger across StrictMode's setup/cleanup replay.
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); };
  }, []);
  return <dialog ref={ref} className={`work-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="work-close" aria-label="閉じる" onClick={onClose}><Icon name="close" /></button>{children}</dialog>;
}
export function Icon({ name }: { name: 'close' | 'play' | 'pause' | 'stop' | 'down' | 'up' | 'sound' | 'sort' | 'download' }) {
  const paths = { close: 'M6 6l12 12M6 18L18 6', play: 'M8 5l12 7-12 7Z', pause: 'M8 5v14M16 5v14', stop: 'M6 6h12v12H6Z', down: 'M5 9l7 7 7-7', up: 'M5 15l7-7 7 7', sound: 'M4 9h4l5-4v14l-5-4H4ZM17 8a7 7 0 0 1 0 8M20 5a11 11 0 0 1 0 14', sort: 'M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4', download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5' };
  return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
