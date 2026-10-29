import type { WidgetState } from './Widget';
export type WidgetPose = 'good' | 'bad' | 'rest' | 'paused';
export const WIDGET_STILL: Record<WidgetPose, number> = { good: 0, bad: 1, rest: 2, paused: 408 };
export const WIDGET_TRANSITIONS: Record<string, [number, number]> = {
  'good:bad': [183, 212], 'bad:good': [213, 287],
  'good:rest': [288, 317], 'rest:good': [318, 347], 'bad:rest': [348, 377], 'rest:bad': [378, 407],
  'good:paused': [409, 438], 'paused:good': [439, 468], 'bad:paused': [469, 498],
  'paused:bad': [499, 528], 'rest:paused': [529, 558], 'paused:rest': [559, 588],
};
export function widgetPose(state: Pick<WidgetState, 'paused' | 'phase' | 'bad'>): WidgetPose {
  return state.paused ? 'paused' : state.phase === 'rest' ? 'rest' : state.bad ? 'bad' : 'good';
}
export function widgetGrowth(state: Pick<WidgetState, 'paused' | 'phase' | 'bad' | 'badSince'>, now: number, reduced = false) {
  return reduced || widgetPose(state) !== 'bad' || state.badSince == null ? 0 : Math.max(0, Math.min(1, (now - state.badSince) / 5000));
}
export function widgetGeometry(pose: WidgetPose, growth: number, availableHeight = 822) {
  // Keep the timer at 178×65; only the character and speech use the available height.
  const fit = Math.max(0, Math.min(1, (availableHeight - 300) / 517));
  const g = pose === 'bad' ? Math.min(growth, fit) : 0;
  const scale = pose === 'rest' ? 27.3894 / 226 : pose === 'paused' ? 35.9935 / 226 : (34.5135 + (130.754 - 34.5135) * g) / 226;
  return {
    growth: g, rigWidth: 860 * scale, rigHeight: 1280 * scale,
    rigLeft: 88 - 650 * scale, rigTop: (pose === 'paused' ? -149 : -145) - 496.4 * g,
    maskLeft: 5 - 78 * g, maskTop: -166 - 463 * g, maskWidth: 150 + 141 * g, maskHeight: 191.72 + 447.28 * g,
    bubbleLeft: pose === 'rest' ? 2 : pose === 'bad' ? 17.21 - 47.62 * g : 27.4,
    bubbleTop: pose === 'rest' ? -160 : -192 - 517 * g,
    bubbleWidth: pose === 'rest' ? 124.55 : pose === 'bad' ? 129.04 + 38.35 * g : 110,
    bubbleHeight: 35 + 18.26 * g, bubbleAngle: 7.71 + 7.32 * g,
    fontSize: 13.2498 + 6.9133 * g, lineHeight: 16 + 8 * g,
    tracking: pose === 'rest' ? -.308514 : .691486 + .360794 * g,
  };
}
export function widgetMessage(pose: WidgetPose, growth: number) {
  return pose === 'paused' ? 'お疲れさま！' : pose === 'rest' ? 'ストレッチした？' : pose === 'bad' ? growth >= .98 ? '顔が近い！' : '姿勢を戻して！' : 'いい感じ！';
}

export function speechGeometry(g: ReturnType<typeof widgetGeometry>, text: string) {
  const count = Array.from(text).length;
  const width = Math.max(g.bubbleWidth, count * g.fontSize + Math.max(0, count - 1) * g.tracking + 24);
  return { ...g, bubbleLeft: g.bubbleLeft - (width - g.bubbleWidth) / 2, bubbleWidth: width };
}
