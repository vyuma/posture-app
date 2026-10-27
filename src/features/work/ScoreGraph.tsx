import { useId, useMemo, useState } from 'react';
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
export function ScoreGraph({ session }: { session: Session }) {
  const id = useId().replace(/:/g, ''); const [index, setIndex] = useState<number | null>(null);
  const groups = useMemo(() => graphSegments(session.samples), [session.samples]);
  const width = 520, height = 170, left = 32, right = 12, top = 12, bottom = 28;
  const max = Math.max(session.focusMs, 1); const x = (ms: number) => left + ms / max * (width - left - right); const y = (score: number) => top + (100 - score) / 100 * (height - top - bottom);
  const active = index === null ? null : session.samples[index];
  const boundary = active ? session.events.filter(event => reasons[event.kind] && Math.abs(event.focusMs - active.focusMs) <= 1000) : [];
  const near = active ? session.samples.filter(point => Math.abs(point.focusMs - active.focusMs) < 1 && point.segment !== active.segment) : [];
  const choose = (relative: number) => {
    const target = Math.max(0, Math.min(1, relative)) * max;
    let best = 0; for (let i = 1; i < session.samples.length; i++) if (Math.abs(session.samples[i].focusMs - target) < Math.abs(session.samples[best].focusMs - target)) best = i;
    setIndex(best);
  };
  return <section className="work-graph"><h3>姿勢スコア <small>点</small></h3>{!session.samples.length ? <div className="work-no-graph">グラフデータなし</div> : <><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="集中時間に沿った姿勢スコア。点線は50点の注意の目安。" onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); choose(((event.clientX - rect.left) / rect.width * width - left) / (width - left - right)); }} onPointerLeave={() => setIndex(null)}><defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#f78000" stopOpacity=".25" /><stop offset="1" stopColor="#f78000" stopOpacity="0" /></linearGradient></defs>{[0, 50, 100].map(value => <g key={value}><text x="0" y={y(value) + 4}>{value}</text><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke={value === 50 ? '#a9a9a9' : '#e6e6e6'} strokeDasharray={value === 50 ? '4 4' : undefined} /></g>)}<text x={width - right} y={y(50) - 5} textAnchor="end">注意の目安</text>{groups.map((group, i) => { const points = group.map(point => `${x(point.focusMs)},${y(point.score!)}`).join(' '); return <g key={i}><polygon points={`${x(group[0].focusMs)},${y(0)} ${points} ${x(group[group.length - 1].focusMs)},${y(0)}`} fill={`url(#${id})`} /><polyline points={points} fill="none" stroke="#f78000" strokeWidth="2" strokeLinejoin="round" />{[group[0], ...(group.length > 1 ? [group[group.length - 1]] : [])].map(point => <circle key={point.sequence} cx={x(point.focusMs)} cy={y(point.score!)} r="2.5" fill="#f78000" />)}</g>; })}<text x={left} y={height - 5}>0:00</text><text x={width - right} y={height - 5} textAnchor="end">{timeLabel(session.focusMs)}</text>{active && <g data-export-exclude="true"><line x1={x(active.focusMs)} x2={x(active.focusMs)} y1={top} y2={y(0)} stroke="#777" strokeDasharray="2 3" />{active.score !== null && <circle cx={x(active.focusMs)} cy={y(active.score)} r="4" fill="#f78000" />}</g>}</svg><input className="work-graph-keyboard" data-export-exclude="true" aria-label="グラフの詳細を確認" type="range" min="0" max={Math.max(0, session.samples.length - 1)} step="1" value={index ?? 0} onFocus={() => setIndex(index ?? 0)} onBlur={() => setIndex(null)} onChange={event => setIndex(Number(event.target.value))} aria-valuetext={active ? `${timeLabel(active.focusMs)}、${active.score === null ? '検出なし' : `${Math.round(active.score)}点`}` : undefined} />{active && <div className="work-graph-tooltip" data-export-exclude="true" role="status"><b>{timeLabel(active.focusMs)}</b> {active.score === null ? '検出なし' : `${Math.round(active.score)}点`}{near.map(point => <span key={point.sequence}>切替前／後：{point.score === null ? '検出なし' : `${Math.round(point.score)}点`}</span>)}{boundary.map((event, i) => <span key={i}>{reasons[event.kind]}</span>)}</div>}</>}</section>;
}
