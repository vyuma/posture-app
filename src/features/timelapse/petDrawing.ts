import lottie, { type AnimationConfigWithData } from 'lottie-web';
import { paintWidget } from '../work/paintWidget';
import { WIDGET_STILL, type WidgetPose } from '../work/widgetPresentation';
import type { SpeechEvent } from '../posture/feedbackSpeech';
import { bindCanvasMattes } from './canvasMattes';

/** Shared by the layout editor, playback and video export. */
export async function loadPetArt(version: string) {
  if (!['expression-states-v1', 'widget-states-v2'].includes(version)) throw new Error('この動画のペット表現を読み込めません。カメラのみの保存は利用できます。');
  const picture = async (name: string) => { const image = new Image(); image.src = `/figma/measure-${name}.svg`; await image.decode(); return image; };
  const [animationData, pause, play, stop] = await Promise.all([
    fetch(`/animations/anago/normal-nago/${version}.json`).then(response => {
      if (!response.ok) throw new Error('ペットのアニメーションを読み込めませんでした');
      return response.json();
    }),
    picture('pause'), picture('play'), picture('stop'),
  ]);
  const canvas = document.createElement('canvas'); canvas.width = 860; canvas.height = version === 'widget-states-v2' ? 1280 : 1022;
  // An external canvas context intentionally replaces the DOM container.
  const animation = lottie.loadAnimation({ renderer: 'canvas', loop: false, autoplay: false, animationData: bindCanvasMattes(animationData), rendererSettings: { context: canvas.getContext('2d')!, dpr: 1, clearCanvas: true, preserveAspectRatio: 'xMidYMax meet' } } as AnimationConfigWithData<'canvas'>);
  try {
    await new Promise<void>((resolve, reject) => {
      if (animation.isLoaded) { resolve(); return; }
      animation.addEventListener('DOMLoaded', () => resolve());
      animation.addEventListener('data_failed', () => reject(new Error('ペットを読み込めませんでした')));
    });
  } catch (error) { animation.destroy(); throw error; }
  return { canvas, controls: { pause, play, stop }, frame: (frame: number) => animation.goToAndStop(frame, true), dispose: () => animation.destroy() };
}

type ReplayWidget = {
  pose: WidgetPose; frame: number; growth: number; angle: number; remainingMs: number; durationMs: number;
  feedbackVersion?: 1; speech?: SpeechEvent | null; reduced: boolean;
};
export function paintReplayWidget(context: CanvasRenderingContext2D, art: Awaited<ReturnType<typeof loadPetArt>>, box: { x: number; y: number; width: number; height: number }, pet: ReplayWidget, time: number, suppressMotion = false) {
  const scale = Math.min(box.width / 300, box.height / 300);
  if (scale <= 0) return;
  context.save();
  context.translate(box.x + box.width / 2 - 89 * scale, box.y + box.height - 77 * scale);
  context.scale(scale, scale);
  art.frame(suppressMotion ? WIDGET_STILL[pet.pose] : pet.frame);
  paintWidget(context, art.canvas, art.controls, pet.pose, suppressMotion ? 0 : pet.growth, suppressMotion ? 0 : pet.angle, pet.remainingMs, pet.durationMs, box.height / scale, pet.feedbackVersion === 1 ? pet.speech ?? null : undefined, time * 1000, suppressMotion || pet.reduced);
  context.restore();
}
