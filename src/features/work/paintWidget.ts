import { speechGeometry, widgetGeometry, widgetMessage, type WidgetPose } from './widgetPresentation';
import { speechMotion, type SpeechEvent } from '../posture/feedbackSpeech';
export type WidgetControlArt = Record<'pause' | 'play' | 'stop', HTMLImageElement>;
/** Canvas counterpart used only when the user includes the pet in a timelapse. */
export function paintWidget(context: CanvasRenderingContext2D, image: HTMLCanvasElement, controls: WidgetControlArt, pose: WidgetPose, growth: number, angle: number, remainingMs: number, durationMs: number, availableHeight: number, speech?: SpeechEvent | null, now = 0, reduced = false) {
  const text = speech === undefined ? widgetMessage(pose, growth) : speech?.text ?? '';
  const base = widgetGeometry(pose, growth, availableHeight);
  const g = speech === undefined ? base : speechGeometry(base, text);
  const motion = speech === undefined ? { visible: true, opacity: 1, y: 0, angle: 0 } : speechMotion(speech, now, reduced, pose === 'bad');
  context.save();
  context.beginPath(); context.rect(pose === 'rest' ? -60 : g.maskLeft, g.maskTop, pose === 'rest' ? 238 : g.maskWidth, g.maskHeight); context.clip();
  context.translate(88, 25); context.rotate(angle * Math.PI / 180); context.translate(-88, -25);
  context.shadowColor = '#00000059'; context.shadowBlur = 6.8098 + 18.9891 * g.growth; context.shadowOffsetX = context.shadowOffsetY = 3.4049 + 9.4946 * g.growth;
  context.drawImage(image, g.rigLeft, g.rigTop, g.rigWidth, g.rigHeight); context.restore();
  if (motion.visible) {
  context.save(); context.translate(g.bubbleLeft + g.bubbleWidth / 2, g.bubbleTop + g.bubbleHeight / 2); context.rotate(g.bubbleAngle * Math.PI / 180);
  context.globalAlpha *= motion.opacity; context.translate(0, motion.y + g.bubbleHeight * .35); context.rotate(motion.angle * Math.PI / 180); context.translate(0, -g.bubbleHeight * .35);
  context.fillStyle = '#fff'; context.beginPath(); context.roundRect(-g.bubbleWidth / 2, -g.bubbleHeight / 2, g.bubbleWidth, g.bubbleHeight, g.bubbleHeight / 2); context.fill();
  const tailWidth = 21.42 + 11.18 * g.growth, tailHeight = 19.04 + 9.94 * g.growth;
  context.beginPath(); context.moveTo(-4, g.bubbleHeight * .25); context.lineTo(-4 + tailWidth, g.bubbleHeight * .25); context.lineTo(-4 + tailWidth * .28, g.bubbleHeight * .25 + tailHeight); context.closePath(); context.fill();
  context.fillStyle = '#000'; context.font = `510 ${g.fontSize}px "SF Pro", -apple-system, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.letterSpacing = `${g.tracking}px`; context.fillText(text, 0, 0); context.restore();
  }
  paintWidgetTimer(context, pose, remainingMs, durationMs, controls);
}

/** Same assets, positions and dimensions as widget.css; icons are part of the video. */
export function paintWidgetTimer(context: CanvasRenderingContext2D, pose: WidgetPose, remainingMs: number, durationMs: number, controls: WidgetControlArt) {
  context.save(); context.fillStyle = pose === 'rest' ? '#f6edd8' : '#ecf8fc'; context.shadowColor = '#00000040'; context.shadowOffsetX = 4; context.shadowOffsetY = 6; context.shadowBlur = 4;
  context.beginPath(); context.roundRect(0, 0, 178, 65, 32.5); context.fill(); context.restore();
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000), time = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  context.fillStyle = pose === 'rest' ? '#6e4211' : '#111f6e'; context.font = `700 ${time.length > 5 ? 22 : 27.6279}px "SF Pro", -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif`; context.textAlign = 'left'; context.textBaseline = 'alphabetic'; context.letterSpacing = time.length > 5 ? '.2px' : '1.15116px';
  // Keep fallback-font text inside the live widget's 82px (rest: 85px) time slot.
  context.fillText(time, pose === 'rest' ? 18 : 21, 36, pose === 'rest' ? 85 : 82);
  context.drawImage(pose === 'paused' ? controls.play : controls.pause, 103, 11, 30, 30);
  context.drawImage(controls.stop, 133, 11, 30, 30);
  context.fillStyle = '#fff'; context.beginPath(); context.roundRect(15, 46, 148, 8, 4); context.fill();
  const progress = Math.max(0, Math.min(1, remainingMs / Math.max(1, durationMs)));
  if (progress) { context.fillStyle = pose === 'rest' ? '#f78000' : '#13a2d7'; context.beginPath(); context.roundRect(15, 46, 148 * progress, 8, 4); context.fill(); }
}
