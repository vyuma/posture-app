import { advanceSession, type Reading, type Session } from './model';

/** The cue belongs to the timer boundary, never to a posture reading or final reward. */
export function advanceWithRestCue(session: Session, now: number, reading: Reading, onRest: () => unknown) {
  const before = session.phase;
  advanceSession(session, now, reading);
  if (before === 'focus' && session.phase === 'rest' && session.status === 'running') void onRest();
}
