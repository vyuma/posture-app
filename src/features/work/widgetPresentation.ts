import type { WidgetState } from './Widget';
export type WidgetPose = 'good' | 'bad' | 'rest' | 'paused';
export const WIDGET_STILL: Record<WidgetPose, number> = { good: 0, bad: 1, rest: 2, paused: 408 };
export const WIDGET_TRANSITIONS: Record<string, [number, number]> = {
  'good:bad': [183, 212], 'bad:good': [213, 287],
  'good:rest': [288, 317], 'rest:good': [318, 347], 'bad:rest': [348, 377], 'rest:bad': [378, 407],
  'good:paused': [409, 438], 'paused:good': [439, 468], 'bad:paused': [469, 498],
  'paused:bad': [499, 528], 'rest:paused': [529, 558], 'paused:rest': [559, 588],
};
// Bad posture keeps the neutral artwork; growth and shaking carry the warning.
export function widgetArtworkPose(pose: WidgetPose): WidgetPose { return pose === 'bad' ? 'good' : pose; }
export function widgetPose(state: Pick<WidgetState, 'paused' | 'phase' | 'bad'>): WidgetPose {
  return state.paused ? 'paused' : state.phase === 'rest' ? 'rest' : state.bad ? 'bad' : 'good';
}
export function widgetGrowth(state: Pick<WidgetState, 'paused' | 'phase' | 'bad' | 'badSince'>, now: number, reduced = false) {
  return reduced || widgetPose(state) !== 'bad' || state.badSince == null ? 0 : Math.max(0, Math.min(1, (now - state.badSince) / 3000));
}
export function widgetGeometry(pose: WidgetPose, growth: number, availableHeight = 822, availableWidth = Infinity) {
  // Keep the 178×65 timer; reserve narrow-screen space for the longest localized feedback.
  const fit = Math.max(0, Math.min(1, (availableHeight - 300) / 253.11, (availableWidth - 276) / 144));
  const g = pose === 'bad' || pose === 'good' ? Math.max(0, Math.min(growth, fit)) : 0;
  const scale = pose === 'rest' ? 27.3894 / 226 : pose === 'paused' ? 35.9935 / 226 : (34.5135 + (75.2396 - 34.5135) * g) / 226;
  const bubbleWidth = pose === 'rest' ? 124.55 : pose === 'bad' ? 163.13 + 80.46 * g : 110;
  const bubbleHeight = 35 + 18.26 * g, bubbleAngle = 7.71 + 7.32 * g;
  // Figma's top coordinate is the rotated balloon's bounding edge.
  const bubbleOffsetY = pose === 'bad' ? (bubbleWidth * Math.sin(bubbleAngle * Math.PI / 180) + bubbleHeight * Math.cos(bubbleAngle * Math.PI / 180) - bubbleHeight) / 2 : 0;
  return {
    growth: g, rigWidth: 860 * scale, rigHeight: 1280 * scale,
    rigLeft: 88 - 650 * scale, rigTop: (pose === 'paused' ? -149 : -145) - 200.6 * g,
    maskLeft: 5 - 97 * g, maskTop: -166 - 226 * g, maskWidth: 150 + 177 * g, maskHeight: 191.72 + 226.23 * g,
    bubbleLeft: pose === 'rest' ? 2 : pose === 'bad' ? -1.32 - 36.82 * g : 27.4,
    bubbleTop: pose === 'rest' ? -160 : (pose === 'bad' ? -195.89 : -192) - 253.11 * g + bubbleOffsetY,
    bubbleWidth, bubbleHeight, bubbleAngle,
    fontSize: 13.2498 + 6.9133 * g, lineHeight: 16 + 8 * g,
    tracking: pose === 'rest' ? -.308514 : .691486 + .360794 * g,
  };
}
export function widgetMessage(pose: WidgetPose, growth: number) {
  return pose === 'paused' ? 'お疲れさま！' : pose === 'rest' ? 'ストレッチした？' : pose === 'bad' ? growth >= .98 ? '顔が近い！' : '姿勢を戻して！' : 'いい感じ！';
}

export function speechGeometry(g: ReturnType<typeof widgetGeometry>, text: string) {
  const count = Array.from(text).length;
  const width = Math.max(g.bubbleWidth, Array.from(text).reduce((width, char) => width + (/\s/.test(char) ? .3 : /[\x00-\x7f]/.test(char) ? .65 : 1), 0) * g.fontSize + Math.max(0, count - 1) * g.tracking + 24);
  return { ...g, bubbleLeft: g.bubbleLeft - (width - g.bubbleWidth) / 2, bubbleWidth: width };
}
