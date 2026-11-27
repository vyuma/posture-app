import { useLayoutEffect, useRef, useState } from 'react';
import type { RuntimeSnapshot } from '../posture/types';
import { emptyEvidence } from '../posture/feedback';
import { FeedbackSpeech, type SpeechEvent } from '../posture/feedbackSpeech';
import { observationMaxAge, petPosture, type PostureSample } from './postureReading';

// Scoring validity and the more conservative reason observer are separate signals.
export function postureSpeechSample(s: PostureSample & Pick<RuntimeSnapshot, 'feedback'>, timeOrigin: number, now = timeOrigin + (s.observedAtMs ?? 0)) {
  const missing = s.trackingStatus === 'missing', grace = s.trackingStatus === 'grace';
  return { observedAt: timeOrigin + (s.observedAtMs ?? 0), maxAge: observationMaxAge(s),
    valid: s.baselineReady && (s.qualityOk || missing || grace), retain: grace,
    reasonAvailable: !missing && s.feedback?.available !== false,
    trackingMissing: missing, directions: s.feedback?.directions,
    causes: s.feedback?.causes,
    posture: petPosture(s, now - timeOrigin), evidence: s.feedback?.evidence ?? emptyEvidence() };
}

export function usePostureSpeech(context: string, mode: 'focus' | 'rest' | 'paused' | 'off', snapshot: RuntimeSnapshot, sessionId: string = context) {
  const machine = useRef(new FeedbackSpeech());
  const input = useRef({ context, mode, snapshot, sessionId });
  input.current = { context, mode, snapshot, sessionId };
  const [value, setValue] = useState<{ key: string; mode: typeof mode; speech: SpeechEvent | null; bad: boolean }>({ key: '', mode: 'off', speech: null, bad: false });
  useLayoutEffect(() => {
    const update = () => {
      const current = input.current, s = current.snapshot;
      const key = `${current.context}:${s.feedback?.epoch ?? 0}`;
      const now = Date.now(), sample = postureSpeechSample(s, performance.timeOrigin, now);
      const bad = current.mode === 'focus' && sample.posture === 'bad';
      const next = machine.current.update({ context: key, sessionId: current.sessionId, mode: current.mode,
        now, ...sample });
      setValue(previous => previous.speech === next && previous.key === key && previous.mode === current.mode && previous.bad === bad ? previous : { key, mode: current.mode, speech: next, bad });
    };
    update();
    if (mode === 'off') return;
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [context, mode, sessionId, snapshot]);
  // Never publish the previous context's message during the render before its effect.
  return mode === 'off' || value.mode !== mode || value.key !== `${context}:${snapshot.feedback?.epoch ?? 0}` ? { bad: false, speech: null } : { bad: value.bad, speech: value.speech };
}
