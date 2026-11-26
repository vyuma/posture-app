/** Sample the complete recording at a steady 30 fps on a timeline capped at one minute. */
export function timelapseTimeline(sourceDuration: number) {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('動画の長さを読み込めませんでした。');
  const duration = Math.min(sourceDuration, 60);
  const speed = sourceDuration / duration;
  const frames = Array.from({ length: Math.ceil(duration * 30) }, (_, index) => {
    const at = index / 30;
    return { at, duration: Math.min(1 / 30, duration - at), sourceAt: at * speed };
  });
  return { duration, speed, frames };
}
