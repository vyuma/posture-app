import { useRef, useState, type PointerEvent, type KeyboardEvent, type CSSProperties, type ReactNode } from 'react';
import { Dialog } from '../work/Dialog';
import { clampRect, DEFAULT_TIMELAPSE, type Rect, type TimelapseSettings as Settings } from './model';
import { TimelapsePetPreview } from './TimelapsePetPreview';
import './timelapse.css';

export function TimelapseSettings({ value, onChange, onClose, children }: { value: Settings; onChange: (value: Settings) => void; onClose: () => void; children?: ReactNode }) {
  const editor = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'camera' | 'pet'; pointerId: number; resize: boolean; x: number; y: number; rect: Rect } | null>(null);
  const [selected, select] = useState<'camera' | 'pet'>('camera');
  const update = (kind: 'camera' | 'pet', rect: Rect) => onChange({ ...value, [kind]: clampRect(rect) });
  function start(event: PointerEvent, kind: 'camera' | 'pet', resize = false) {
    if (event.button !== 0) return;
    // Keep image/text native dragging from cancelling the placement gesture.
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId); select(kind);
    drag.current = { kind, pointerId: event.pointerId, resize, x: event.clientX, y: event.clientY, rect: value[kind] };
  }
  function move(event: PointerEvent) {
    event.stopPropagation();
    const current = drag.current, element = editor.current;
    if (!current || current.pointerId !== event.pointerId || !element) return;
    const bounds = element.getBoundingClientRect();
    // Percentage positions use the padding box, excluding the editor's border.
    const dx = (event.clientX - current.x) / (bounds.width * element.clientWidth / element.offsetWidth), dy = (event.clientY - current.y) / (bounds.height * element.clientHeight / element.offsetHeight);
    update(current.kind, current.resize ? { ...current.rect, width: Math.min(1 - current.rect.x, current.rect.width + dx), height: Math.min(1 - current.rect.y, current.rect.height + dy) } : { ...current.rect, x: current.rect.x + dx, y: current.rect.y + dy });
  }
  function key(event: KeyboardEvent, kind: 'camera' | 'pet', resize = false) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? .05 : .01;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0, dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    update(kind, resize ? { ...value[kind], width: Math.min(1 - value[kind].x, value[kind].width + dx), height: Math.min(1 - value[kind].y, value[kind].height + dy) } : { ...value[kind], x: value[kind].x + dx, y: value[kind].y + dy });
  }
  return <Dialog title="設定" className="timelapse-settings" onClose={onClose}>
    <h1>設定</h1>{children}<h2>タイムラプス</h2>
    <label className="work-remember timelapse-recording-setting"><input type="checkbox" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} /><span>タイムラプスを記録する</span></label>
    <fieldset className="timelapse-quality"><legend>録画の画質</legend>{([720, 1080] as const).map(quality => <label key={quality}><input type="radio" name="timelapse-quality" value={quality} checked={value.quality === quality} onChange={() => onChange({ ...value, quality })} /><span>{quality}p{quality === 720 ? '（標準）' : '（高画質）'}</span></label>)}</fieldset>
    <p className="timelapse-help">次の録画から反映します。カメラが対応する実際の解像度で記録します。</p>
    <fieldset className="timelapse-export-options"><legend>再生・保存する映像</legend>
      <label className="work-remember"><input type="checkbox" checked={value.includePet} onChange={event => onChange({ ...value, includePet: event.target.checked })} /><span>映像の中にペットと残り時間を表示</span></label>
      <label className="work-remember"><input type="checkbox" checked={value.includeScene} onChange={event => onChange({ ...value, includeScene: event.target.checked })} /><span>保存・共有に背景と左右のアナゴも含める</span></label>
    </fieldset>
    <div className="timelapse-layout-heading"><h3>映像内の配置</h3><button type="button" onClick={() => onChange({ ...value, camera: { ...DEFAULT_TIMELAPSE.camera }, pet: { ...DEFAULT_TIMELAPSE.pet } })}>配置を戻す</button></div>
    <p id="timelapse-layout-help" className="timelapse-help">ドラッグで移動、右下のつまみで大きさを調整できます。矢印キーでも操作できます。</p>
    <div className="timelapse-editor" ref={editor} aria-describedby="timelapse-layout-help" onDragStart={event => event.preventDefault()} onLostPointerCapture={() => { drag.current = null; }}>
      {(['camera', 'pet'] as const).filter(kind => kind === 'camera' || value.includePet).map(kind => <div key={kind} role="group" aria-label={`${kind === 'camera' ? 'カメラ' : 'ペット'}の位置を矢印キーで調整`} tabIndex={0} className={`timelapse-edit-item ${kind}`} data-selected={selected === kind} style={{ left: `${value[kind].x * 100}%`, top: `${value[kind].y * 100}%`, width: `${value[kind].width * 100}%`, height: `${value[kind].height * 100}%` } as CSSProperties} onFocus={() => select(kind)} onPointerDown={event => start(event, kind)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={event => key(event, kind)}>
        {kind === 'camera' ? <span>カメラ</span> : <TimelapsePetPreview />}
        <button type="button" className="timelapse-resize" aria-label={`${kind === 'camera' ? 'カメラ' : 'ペット'}のサイズを矢印キーで調整`} onPointerDown={event => start(event, kind, true)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={event => key(event, kind, true)} />
      </div>)}
    </div>
    <p className="timelapse-help">配置は過去の動画にも共通で適用します。左右のアナゴの位置は固定です。保存済みのファイルは変わりません。</p>
    <p className="timelapse-storage-note">集中時間だけを無音で記録します。動画はコレクションを初期化するまで、この端末に保存されます。保存・共有はいつも1倍速です。</p>
    <button className="work-button blue" onClick={onClose}>完了</button>
  </Dialog>;
}
