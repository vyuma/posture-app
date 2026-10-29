import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type Option<T extends string> = { value: T; label: string };
export function OptionMenu<T extends string>({ value, onChange, options, label, className, arrow, disabled = false }: {
  value: T; onChange: (value: T) => void; options: readonly Option<T>[];
  label: string; className: string; arrow: ReactNode; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const selected = Math.max(0, options.findIndex(option => option.value === value));

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      setAbove(below < menu.current.offsetHeight + 18 && rect.top > below);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const current = items.current[selected];
    current?.focus({ preventScroll: true });
    if (current && menu.current) menu.current.scrollTop = Math.max(0, current.offsetTop - menu.current.clientHeight / 2);
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, selected]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function navigate(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      close();
      return;
    }
    const index = items.current.findIndex(item => item === document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % options.length
      : event.key === 'ArrowUp' ? (index + options.length - 1) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null;
    if (next !== null) {
      event.preventDefault();
      items.current[next]?.focus();
    }
  }

  return <div ref={root} className={className} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} className={`${className}-trigger`} disabled={!options.length} aria-disabled={disabled || undefined} type="button"
      aria-label={`${label}: ${options[selected]?.label ?? "なし"}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { if (!disabled) setOpen(!open); }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!disabled) setOpen(true);
        }
      }}>
      {arrow}
      <span>{options[selected]?.label ?? "なし"}</span>
    </button>
    {open && <div ref={menu} id={menuId} role="menu" aria-label={label} className={`${className}-menu`} data-above={above} onKeyDown={navigate}>
      {options.map((option, index) => <button key={option.value} ref={element => { items.current[index] = element; }}
        type="button" role="menuitemradio" aria-checked={value === option.value} tabIndex={-1}
        className={`${className}-option`} onClick={() => { if (!disabled) { onChange(option.value); close(); } }}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>{option.label}</span>
      </button>)}
    </div>}
  </div>;
}
