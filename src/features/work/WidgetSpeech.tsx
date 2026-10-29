import { useEffect, useState } from 'react';
import { speechMotion, type SpeechEvent } from '../posture/feedbackSpeech';

export function WidgetSpeech({ event, reduced, bad = false }: { event: SpeechEvent | null; reduced: boolean; bad?: boolean }) {
  const [shown, setShown] = useState({ event, bad, enteredAt: Date.now() });
  const [leavingAt, setLeavingAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  // An expired warning can remain visible only while the pet is still angry.
  const incoming = event?.whileBad && !bad && now >= event.endsAt ? null : event;
  useEffect(() => {
    const replace = () => { setShown({ event: incoming, bad, enteredAt: Date.now() }); setLeavingAt(null); };
    if (reduced || !shown.event || (!shown.event.whileBad || !shown.bad) && Date.now() >= shown.event.endsAt) { replace(); return; }
    if (shown.event.id === incoming?.id) {
      setShown(previous => previous.bad === bad ? previous : { ...previous, bad });
      setLeavingAt(null); return;
    }
    // Freeze the outgoing pose so its fade is not chased by the idle animation.
    setLeavingAt(Date.now());
    const timer = setTimeout(replace, 300);
    return () => clearTimeout(timer);
  }, [incoming?.id, reduced, bad]);
  useEffect(() => {
    if (!shown.event) return;
    let frame = 0;
    const update = () => {
      const at = Date.now(); setNow(at);
      if (shown.event!.whileBad && shown.bad || at < shown.event!.endsAt) frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [shown]);
  const motion = speechMotion(shown.event ? { ...shown.event, startedAt: Math.max(shown.event.startedAt, shown.enteredAt) } : null, leavingAt ?? now, reduced, shown.bad);
  const leaving = leavingAt !== null;
  return <>
    <span className="work-widget-announcement" role="status" aria-atomic="true">{motion.visible && !leaving ? shown.event?.text : ''}</span>
    {motion.visible && shown.event && <div className="work-widget-speech-frame" data-speech-code={shown.event.code} aria-hidden="true">
      <div className="work-widget-speech is-feedback" style={{ transition: leaving && !reduced ? "opacity 300ms cubic-bezier(.4,0,.2,1), transform 300ms cubic-bezier(.4,0,.2,1)" : undefined, opacity: leaving ? 0 : motion.opacity, transform: `translateY(${motion.y + (leaving ? 3 : 0)}px) rotate(${motion.angle}deg)` }}><span>{shown.event.text}</span></div>
    </div>}
  </>;
}
