import { useEffect, useRef, useState } from 'react';
import { ASSET_VERSION } from './model';
import { loadPetArt, paintReplayWidget } from './petDrawing';

export function TimelapsePetPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('ペットを読み込み中…');
  useEffect(() => {
    const target = canvas.current!;
    let disposed = false, art: Awaited<ReturnType<typeof loadPetArt>> | undefined;
    function paint() {
      if (!art || disposed) return;
      const { width, height } = target.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      target.width = Math.round(width * dpr); target.height = Math.round(height * dpr);
      const context = target.getContext('2d')!;
      context.scale(dpr, dpr);
      paintReplayWidget(context, art, { x: 0, y: 0, width, height }, { pose: 'good', frame: 0, growth: 0, angle: 0, remainingMs: 1_500_000, durationMs: 1_500_000, reduced: true }, 0);
    }
    const observer = new ResizeObserver(paint); observer.observe(target);
    void loadPetArt(ASSET_VERSION).then(loaded => {
      if (disposed) { loaded.dispose(); return; }
      art = loaded; paint(); setStatus('');
    }).catch(() => { if (!disposed) setStatus('ペットを読み込めませんでした。設定を開き直してください。'); });
    return () => { disposed = true; observer.disconnect(); art?.dispose(); };
  }, []);
  return <><canvas ref={canvas} className="timelapse-pet-preview" role="img" aria-label="ペットの配置プレビュー、残り25分" />{status && <span className="timelapse-pet-preview-status" role="status">{status}</span>}</>;
}
