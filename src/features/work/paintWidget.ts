import { speechGeometry, widgetGeometry, widgetMessage, type WidgetPose } from './widgetPresentation';
import { speechMotion, type SpeechEvent } from '../posture/feedbackSpeech';
export type WidgetControlArt = Record<'pause' | 'play' | 'stop', HTMLImageElement>;
// Reuse the clipped artwork surface across frames; shadows must be drawn after clipping.
const artworkSurfaces = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();
function clippedArtwork(context: CanvasRenderingContext2D, width: number, height: number) {
  let surface = artworkSurfaces.get(context);
  if (!surface) { surface = document.createElement('canvas'); artworkSurfaces.set(context, surface); }
  // Growing in buckets avoids reallocating the backing store on every growth frame.
  if (surface.width < width) surface.width = 2 ** Math.ceil(Math.log2(width));
  if (surface.height < height) surface.height = 2 ** Math.ceil(Math.log2(height));
  return surface;
}

/** Canvas counterpart used only when the user includes the pet in a timelapse. */
export function paintWidget(context: CanvasRenderingContext2D, image: HTMLCanvasElement, controls: WidgetControlArt, pose: WidgetPose, growth: number, angle: number, remainingMs: number, durationMs: number, availableHeight: number, speech?: SpeechEvent | null, now = 0, reduced = false) {
  const text = speech === undefined ? widgetMessage(pose, growth) : speech?.text ?? '';
  const base = widgetGeometry(pose, growth, availableHeight);
  const g = speech === undefined ? base : speechGeometry(base, text);
  const motion = speech === undefined ? { visible: true, opacity: 1, y: 0, angle: 0 } : speechMotion(speech, now, reduced, pose === 'bad');
  const transform = context.getTransform();
  const pixelScale = Math.max(.01, Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d));
  const maskLeft = pose === 'rest' ? -60 : g.maskLeft, maskWidth = pose === 'rest' ? 238 : g.maskWidth;
  const width = Math.ceil(maskWidth * pixelScale), height = Math.ceil(g.maskHeight * pixelScale);
  const surface = clippedArtwork(context, width, height), artwork = surface.getContext('2d')!;
  artwork.setTransform(1, 0, 0, 1, 0, 0); artwork.clearRect(0, 0, surface.width, surface.height);
  artwork.save(); artwork.scale(pixelScale, pixelScale); artwork.translate(-maskLeft, -g.maskTop);
  artwork.beginPath(); artwork.rect(maskLeft, g.maskTop, maskWidth, g.maskHeight); artwork.clip();
  artwork.translate(88, 25); artwork.rotate(angle * Math.PI / 180); artwork.translate(-88, -25);
  artwork.drawImage(image, g.rigLeft, g.rigTop, g.rigWidth, g.rigHeight); artwork.restore();
  context.save();
  // Canvas blur is twice the CSS drop-shadow standard deviation, in device pixels.
  context.shadowColor = '#00000059'; context.shadowBlur = (6.8098 + 18.9891 * g.growth) * 2 * pixelScale;
  context.shadowOffsetX = context.shadowOffsetY = (3.4049 + 9.4946 * g.growth) * pixelScale;
  context.drawImage(surface, 0, 0, width, height, maskLeft, g.maskTop, width / pixelScale, height / pixelScale); context.restore();
  if (motion.visible) {
  context.save(); context.translate(g.bubbleLeft + g.bubbleWidth / 2, g.bubbleTop + g.bubbleHeight / 2); context.rotate(g.bubbleAngle * Math.PI / 180);
  context.globalAlpha *= motion.opacity; context.translate(0, motion.y + g.bubbleHeight * .35); context.rotate(motion.angle * Math.PI / 180); context.translate(0, -g.bubbleHeight * .35);
  context.shadowColor = '#00000040'; context.shadowOffsetX = 0; context.shadowOffsetY = 4 * pixelScale; context.shadowBlur = 8 * pixelScale;
  context.fillStyle = '#fff'; context.beginPath(); context.roundRect(-g.bubbleWidth / 2, -g.bubbleHeight / 2, g.bubbleWidth, g.bubbleHeight, g.bubbleHeight / 2);
  const tailWidth = 21.42 + 11.18 * g.growth, tailHeight = 19.04 + 9.94 * g.growth;
  context.moveTo(-4, g.bubbleHeight * .25); context.lineTo(-4 + tailWidth, g.bubbleHeight * .25); context.lineTo(-4 + tailWidth * .28, g.bubbleHeight * .25 + tailHeight); context.closePath(); context.fill();
  context.shadowColor = 'transparent';
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
