import { useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { timeLabel, type Sample, type Session } from './model';

/** Keep segment ends and bucket extrema. Stored samples are never downsampled. */
export function graphSegments(samples: Sample[], pixels = 520): Sample[][] {
  const segments: Sample[][] = [];
  for (const sample of samples) {
    if (sample.score === null) continue;
    const last = segments[segments.length - 1];
    if (!last || last[0].segment !== sample.segment) segments.push([sample]); else last.push(sample);
  }
  return segments.map(segment => {
    if (segment.length <= pixels * 2) return segment;
    const result = [segment[0]]; const size = Math.ceil(segment.length / pixels);
    for (let i = 1; i < segment.length - 1; i += size) {
      const bucket = segment.slice(i, Math.min(segment.length - 1, i + size));
      const min = bucket.reduce((a, b) => a.score! < b.score! ? a : b);
      const max = bucket.reduce((a, b) => a.score! > b.score! ? a : b);
      result.push(...(min === max ? [min] : [min, max].sort((a, b) => a.sequence - b.sequence)));
    }
    result.push(segment[segment.length - 1]); return result;
  });
}
const reasons: Record<string, string> = { rest: '休憩開始', focus: '集中を再開', pause: '一時停止', resume: '再開', recalibrate: '姿勢を再登録', calibrated: '新しい基準で再開', calibration_cancelled: '以前の基準で再開', tracking_lost: '検出できない時間', tracking_restored: '検出を再開' };
export function graphTimeTicks(durationMs: number) {
  const minutes = durationMs / 60_000;
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 240].find(value => minutes / value <= 5) ?? Math.ceil(minutes / 5 / 60) * 60;
  const ticks = [0];
  for (let ms = step * 60_000; ms < durationMs * .92; ms += step * 60_000) ticks.push(ms);
  if (durationMs > 0) ticks.push(durationMs);
  return ticks;
}

/** At a segment boundary, pointer height disambiguates the before/after samples. */
export function closestGraphSample(samples: Sample[], focusMs: number, score: number) {
  let best = 0;
  for (let i = 1; i < samples.length; i++) {
    const distance = Math.abs(samples[i].focusMs - focusMs);
    const previous = Math.abs(samples[best].focusMs - focusMs);
    if (distance < previous || (distance === previous && Math.abs((samples[i].score ?? 0) - score) < Math.abs((samples[best].score ?? 0) - score))) best = i;
  }
  return best;
}

export function ScoreGraph({ session }: { session: Session }) {
  const id = useId().replace(/:/g, ''); const [index, setIndex] = useState<number | null>(null);
  const keyboardFocused = useRef(false);
  const groups = useMemo(() => graphSegments(session.samples), [session.samples]);
  const width = 401, height = 164, left = 28, right = 14, top = 6, bottom = 20;
  const max = Math.max(session.focusMs, 1);
  const x = (ms: number) => left + ms / max * (width - left - right);
  const y = (score: number) => top + (100 - Math.max(0, Math.min(100, score))) / 100 * (height - top - bottom);
  const active = index === null ? null : session.samples[index];
  const boundary = active ? session.events.filter(event => reasons[event.kind] && Math.abs(event.focusMs - active.focusMs) <= 1000) : [];
  const near = active ? session.samples.filter(point => Math.abs(point.focusMs - active.focusMs) < 1 && point.segment !== active.segment) : [];
  const activeX = active ? x(active.focusMs) / width * 100 : 0;
  const activeY = active ? y(active.score ?? 0) / height * 100 : 0;
  function inspect(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ms = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * width - left) / (width - left - right))) * max;
    const score = 100 - ((event.clientY - rect.top) / rect.height * height - top) / (height - top - bottom) * 100;
    setIndex(closestGraphSample(session.samples, ms, score));
  }
  return <section className="work-graph" aria-label="姿勢の記録">
    {!session.samples.length ? <div className="work-no-graph">グラフデータなし</div> : <>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="集中時間に沿った姿勢の記録。上端の基準線は登録した姿勢の基準、100点です。"
        onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={event => { if (event.pointerType === 'mouse' && !keyboardFocused.current) setIndex(null); }}>
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop className="work-graph-fill" stopOpacity=".2" /><stop offset="1" className="work-graph-fill" stopOpacity="0" /></linearGradient></defs>
        {[0, 25, 50, 75, 100].map(value => <line key={value} x1={left} x2={width - right} y1={y(value)} y2={y(value)} className={value === 100 ? 'work-graph-baseline' : 'work-graph-grid'} />)}
        <text x="0" y={y(100) + 4} className="work-graph-baseline-label">基準</text>
        {groups.map((group, i) => {
          const points = group.map(point => `${x(point.focusMs)},${y(point.score!)}`).join(' ');
          return <g key={i}><polygon points={`${x(group[0].focusMs)},${y(0)} ${points} ${x(group[group.length - 1].focusMs)},${y(0)}`} fill={`url(#${id})`} />
            <polyline points={points} fill="none" className="work-graph-line" strokeWidth="3" strokeLinejoin="round" />
            {[group[0], ...(group.length > 1 ? [group[group.length - 1]] : [])].map(point => <circle key={point.sequence} cx={x(point.focusMs)} cy={y(point.score!)} r="3" className="work-graph-point" />)} </g>;
        })}
        {graphTimeTicks(session.focusMs).map((ms, i, ticks) => <text key={ms} x={x(ms)} y={height - 5} textAnchor="middle">{i === ticks.length - 1 ? `${+(ms / 60_000).toFixed(1)}分` : +(ms / 60_000).toFixed(1)}</text>)}
        {active && <g data-export-exclude="true"><line x1={x(active.focusMs)} x2={x(active.focusMs)} y1={top} y2={y(0)} className="work-graph-guide" />{active.score !== null && <circle cx={x(active.focusMs)} cy={y(active.score)} r="4" className="work-graph-point" />}</g>}
      </svg>
      <input className="work-graph-keyboard" data-export-exclude="true" aria-label="グラフの詳細を確認" type="range" min="0" max={Math.max(0, session.samples.length - 1)} step="1" value={index ?? 0} onFocus={() => { keyboardFocused.current = true; setIndex(index ?? 0); }} onBlur={() => { keyboardFocused.current = false; setIndex(null); }} onChange={event => setIndex(Number(event.target.value))} aria-valuetext={active ? `${timeLabel(active.focusMs)}、${active.score === null ? '検出なし' : `${Math.round(active.score)}点`}` : undefined} />
      {active && <div className={`work-graph-tooltip${activeX > 55 ? ' is-left' : ''}${activeY < 35 ? ' is-below' : ''}`} style={{ left: `${activeX}%`, top: `${activeY}%` }} data-export-exclude="true" role="status">
        <div><time>{timeLabel(active.focusMs)}</time><strong>{active.score === null ? '検出なし' : <>{Math.round(active.score)}<small>点</small></>}</strong></div>
        {near.map(point => <span key={point.sequence}>切替前／後：{point.score === null ? '検出なし' : `${Math.round(point.score)}点`}</span>)}
        {boundary.map((event, i) => <span key={i}>{reasons[event.kind]}</span>)}
      </div>}
    </>}
  </section>;
}
