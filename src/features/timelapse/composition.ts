import { loadPetArt, paintReplayWidget } from './petDrawing';
import { character } from '../work/CharacterCard';
import { replayPet, type Clip, type TimelapseSettings } from './model';
import { paintWidgetTimer } from '../work/paintWidget';

type DrawFrame = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => void;
const picture = async (src: string) => { const image = new Image(); image.src = src; await image.decode(); return image; };
function round(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { context.beginPath(); context.roundRect(x, y, width, height, radius); }
function fit(width: number, height: number, x: number, y: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return [x + (boxWidth - width * scale) / 2, y + (boxHeight - height * scale) / 2, width * scale, height * scale] as const;
}

/** The player and exporter share the composition; playback controls are not included. */
export async function createComposition(clip: Clip, settings: TimelapseSettings, acquiredId?: string | null, scene = false) {
  let art: Awaited<ReturnType<typeof loadPetArt>> | undefined;
  let left: HTMLImageElement | undefined, right: HTMLImageElement | undefined;
  try {
    if (settings.includePet) {
      art = await loadPetArt(clip.assetVersion);
    }
    if (scene) [left, right] = await Promise.all([picture('/figma/timelapse-shima.png'), picture(acquiredId ? character(acquiredId).portraitSrc : '/figma/result-unacquired.png')]);
  } catch (error) { art?.dispose(); throw error; }
  return {
    dispose() { art?.dispose(); },
    paint(context: CanvasRenderingContext2D, width: number, height: number, time: number, drawFrame: DrawFrame, suppressMotion = false) {
      context.save(); context.clearRect(0, 0, width, height);
      let videoBox = { x: 0, y: 0, width, height };
      if (scene) {
        context.scale(width / 1512, height / 982);
        const gradient = context.createLinearGradient(0, 0, 0, 982); gradient.addColorStop(0, '#13a2d7'); gradient.addColorStop(1, '#f2edcc');
        context.fillStyle = gradient; context.fillRect(0, 0, 1512, 982);
        context.fillStyle = '#fff'; round(context, 288, 162, 936, 729, 32); context.fill();
        context.save(); context.translate(258, 646); context.scale(-1, 1); context.drawImage(left!, 0, 0, 209, 336); context.restore();
        const rightWidth = right!.naturalWidth / right!.naturalHeight * 326;
        context.drawImage(right!, 1266 + (203 - rightWidth) / 2, 656, rightWidth, 326);
        videoBox = { x: 372, y: 284, width: 768, height: 451 };
        round(context, videoBox.x, videoBox.y, videoBox.width, videoBox.height, 32); context.clip();
        context.fillStyle = '#e9eef0'; context.fillRect(videoBox.x, videoBox.y, videoBox.width, videoBox.height);
        const [x, y, w, h] = fit(clip.width, clip.height, videoBox.x, videoBox.y, videoBox.width, videoBox.height);
        videoBox = { x, y, width: w, height: h };
      }
      context.fillStyle = '#e9eef0'; context.fillRect(videoBox.x, videoBox.y, videoBox.width, videoBox.height);
      const camera = settings.camera;
      drawFrame(context, ...fit(clip.width, clip.height, videoBox.x + camera.x * videoBox.width, videoBox.y + camera.y * videoBox.height, camera.width * videoBox.width, camera.height * videoBox.height));
      const pet = settings.includePet ? replayPet(clip.events, time) : null;
      if (pet?.visible && art) {
        const rect = settings.pet;
        if (clip.assetVersion === 'widget-states-v2') {
          const boxWidth = rect.width * videoBox.width, boxHeight = rect.height * videoBox.height;
          paintReplayWidget(context, art, { x: videoBox.x + rect.x * videoBox.width, y: videoBox.y + rect.y * videoBox.height, width: boxWidth, height: boxHeight }, pet, time, suppressMotion);
        } else {
        const [x, y, w, h] = fit(264, 371, videoBox.x + rect.x * videoBox.width, videoBox.y + rect.y * videoBox.height, rect.width * videoBox.width, rect.height * videoBox.height);
        context.translate(x + w * 22 / 264, y); context.scale(w / 264, h / 371);
        art.frame(suppressMotion ? { good: 0, bad: 1, paused: 2, rest: 2 }[pet.pose] : pet.frame);
        const growth = suppressMotion ? 1 : 1 + pet.growth * .8;
        context.save(); context.translate(110, 299); context.rotate((suppressMotion ? 0 : pet.angle) * Math.PI / 180);
        context.scale(growth, growth); context.drawImage(art.canvas, ...fit(860, 1022, -110, -158, 220, 166)); context.restore();
        const timerScale = 72 / 65;
        context.save(); context.translate((220 - 178 * timerScale) / 2, 299); context.scale(timerScale, timerScale);
        paintWidgetTimer(context, pet.pose, pet.remainingMs, pet.durationMs, art.controls); context.restore();
        }
      }
      context.restore();
    },
  };
}
