import { useEffect, useRef, useState } from 'react';
import type { RuntimeSnapshot } from '../posture/types';
import { emptyEvidence } from '../posture/feedback';
import { FeedbackSpeech, type SpeechEvent } from '../posture/feedbackSpeech';
import { observationMaxAge, type PostureSample } from './postureReading';

// Scoring validity and the more conservative reason observer are separate signals.
export function postureSpeechSample(s: PostureSample & Pick<RuntimeSnapshot, 'feedback'>, timeOrigin: number) {
  const missing = s.trackingStatus === 'missing', grace = s.trackingStatus === 'grace';
  return { observedAt: timeOrigin + (s.observedAtMs ?? 0), maxAge: observationMaxAge(s),
    valid: s.baselineReady && (s.qualityOk || missing || grace), retain: grace,
    reasonAvailable: !missing && s.feedback?.available !== false,
    posture: missing ? 'bad' as const : s.postureState, evidence: s.feedback?.evidence ?? emptyEvidence() };
}

export function usePostureSpeech(context: string, mode: 'focus' | 'rest' | 'paused' | 'off', snapshot: RuntimeSnapshot, sessionId: string = context) {
  const machine = useRef(new FeedbackSpeech());
  const input = useRef({ context, mode, snapshot, sessionId });
  input.current = { context, mode, snapshot, sessionId };
  const [value, setValue] = useState<{ key: string; mode: typeof mode; speech: SpeechEvent | null }>({ key: '', mode: 'off', speech: null });
  useEffect(() => {
    const update = () => {
      const current = input.current, s = current.snapshot;
      const key = `${current.context}:${s.feedback?.epoch ?? 0}`;
      const next = machine.current.update({ context: key, sessionId: current.sessionId, mode: current.mode,
        now: Date.now(), ...postureSpeechSample(s, performance.timeOrigin) });
      setValue(previous => previous.speech === next && previous.key === key && previous.mode === current.mode ? previous : { key, mode: current.mode, speech: next });
    };
    update();
    if (mode === 'off') return;
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [context, mode, sessionId]);
  // Never publish the previous context's message during the render before its effect.
  return mode === 'off' || value.mode !== mode || value.key !== `${context}:${snapshot.feedback?.epoch ?? 0}` ? null : value.speech;
}
