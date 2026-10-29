/** Development-only scripted observations; never reads or modifies collection data. */
import { useEffect, useRef, useState } from 'react';
import { FeedbackSpeech, type SpeechEvent } from '../posture/feedbackSpeech';
import messages from '../posture/postureFeedback.json';
import { type WidgetState } from './Widget';
import { createPostureEngineState, evaluatePostureFrame } from '../posture/engine';
import { postureSpeechSample } from './usePostureSpeech';
import { petPosture } from './postureReading';
import { emptyEvidence } from '../posture/feedback';

const policyDuration = (name: string) => name === 'Praise rules' || name === 'Landmark loss' ? 22000 : 14500;
function landmarks(hidden = false) {
  const p = Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  for(const [i,x,y] of [[0,.5,.20],[7,.43,.24],[8,.57,.24],[11,.35,.45],[12,.65,.45],[23,.4,.8],[24,.6,.8]]) p[i]={x,y,z:0,visibility:1};
  if(hidden) p[7].visibility=0;
  return p;
}

export function FeedbackPreview({ publish }: { publish: (value: WidgetState | null) => void }) {
  const publishRef = useRef(publish); publishRef.current = publish;
  const [run, setRun] = useState({ name: '', id: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [diagnostic, setDiagnostic] = useState('');
  useEffect(() => {
    if (!run.name) return;
    const machine = new FeedbackSpeech(), start = Date.now(); let previous: SpeechEvent | null = null;
    let engine=createPostureEngineState(), observed=start, result=evaluatePostureFrame(engine,start-6500,landmarks(),null).result, badAt:number|null=null;
    if(run.name==='Landmark loss') for(let at=start-6500;at<start;at+=100) { const next=evaluatePostureFrame(engine,at,landmarks(),null);engine=next.state;result=next.result; }
    setLog([]);
    setDiagnostic('');
    const update = () => {
      const now = Date.now(), age = now - start;
      if(run.name==='Landmark loss') {
        const frozen=age>=12500&&age<15000;
        if(!frozen) { const next=evaluatePostureFrame(engine,now,landmarks(age>=2500&&age<3000||age>=4500&&age<10500),null);engine=next.state;result=next.result;observed=now; }
        const snapshot={...result,...result.eval,observedAtMs:observed,trackingIntervalMs:100,feedback:{epoch:1,baselineReady:true,available:result.eval.qualityOk,evidence:emptyEvidence()}};
        const speech=machine.update({context:`preview-${run.id}`,now,mode:'focus',...postureSpeechSample(snapshot,0)});
        const posture=petPosture(snapshot,now),bad=posture==='bad';badAt=bad?badAt??now:null;
        setDiagnostic(`${frozen?'camera frozen':result.trackingStatus} / pet ${posture} / score ${result.eval.qualityOk&&!frozen?'measured':'gap'}`);
        if(speech?.id!==previous?.id) { if(speech) setLog(v=>[...v,`${(age/1000).toFixed(1)}s ${speech.text}`]); previous=speech; }
        publishRef.current({sessionId:'preview',remainingMs:923000,durationMs:1500000,phase:'focus',paused:false,bad,badSince:badAt,cycle:1,cycles:4,feedbackVersion:1,speech});
        return;
      }
      const both = run.name === 'Both resolve', handoff = run.name === 'A to B', missing = run.name === 'Unavailable';
      const evidence = { faceNear: 0, headForward: 0, headTilt: 0, bodyTilt: 0 };
      if (both || handoff) { evidence.faceNear = age < 6000 ? 2 : 0; evidence.headTilt = age < 6000 || handoff && age < 10000 ? 1.5 : 0; }
      else if (run.name === 'Maximum') evidence.headForward = 2;
      else if (run.name in evidence) evidence[run.name as keyof typeof evidence] = 2;
      const jitter = run.name === 'Good jitter' && age >= 800 && Math.floor(age / 100) % 8 === 0;
      const policy = run.name === 'Praise rules';
      const mode = policy && age >= 4500 && age < 5500 ? 'paused' : policy && age >= 8500 && age < 9500 ? 'rest' : 'focus';
      const bad = policy && age >= 12500 && age < 14500 || run.name === 'Bad / no reason' || Object.values(evidence).some(v => v >= 1);
      const speech = machine.update({ context: `preview-${run.id}`, now, observedAt: now, maxAge: 1500, mode, valid: !jitter && (!missing || age < 2500 || age > 9000), reasonAvailable: run.name !== 'Bad / no reason', posture: bad ? 'bad' : 'good', evidence });
      if (speech?.id !== previous?.id) { if (speech) setLog(v => [...v, `${((now - start)/1000).toFixed(1)}s ${speech.text}`]); previous = speech; }
      publishRef.current({ sessionId: 'preview', remainingMs: 923000, durationMs: 1500000, phase: mode === 'rest' ? 'rest' : 'focus', paused: mode === 'paused', bad, badSince: bad ? start - (run.name === 'Maximum' ? 5000 : 0) : null, cycle: 1, cycles: 4, feedbackVersion: 1, speech });
    };
    update(); const timer = setInterval(update, 100);
    const end = setTimeout(() => clearInterval(timer), policyDuration(run.name));
    return () => { clearInterval(timer); clearTimeout(end); };
  }, [run]);
  return <section aria-label="案内の動作検証" style={{ position: 'fixed', zIndex: 20001, left: 16, top: 150, maxWidth: 'min(340px, calc(100vw - 32px))', padding: 16, borderRadius: 16, background: '#fff', color: '#111f6e' }}>
    <p>合成した観測による表示検証（カメラ判定ではありません）</p>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['A to B', 'Both resolve', 'Unavailable', 'Good jitter', 'Praise rules', 'Landmark loss', 'Bad / no reason', 'Maximum', 'faceNear', 'headForward', 'headTilt', 'bodyTilt'].map(name => <button key={name} onClick={() => setRun(v => ({ name, id: v.id + 1 }))}>{name in messages ? messages[name as keyof typeof messages] : name}</button>)}</div>
    <output aria-label="検出状態">{diagnostic}</output>
    <output aria-label="案内の履歴" style={{ display: 'block', whiteSpace: 'pre-line', marginTop: 12 }}>{log.join('\n')}</output>
  </section>;
}
