import type { Rect } from './model';
import { speechGeometry, widgetGeometry, type WidgetPose } from '../work/widgetPresentation';
import { widgetBounds } from '../work/widgetPosition';
import messages from '../posture/postureFeedback.json';

const availableHeight = 822;
const poses: WidgetPose[] = ['good', 'bad', 'rest', 'paused'];
// Include recovery at full height, all current speech, and the timer/shadows.
const bounds = poses.flatMap(pose => [0, 1].flatMap(growth => Object.values(messages).map(text =>
  widgetBounds(pose, speechGeometry(widgetGeometry(pose, growth, availableHeight), text)),
)));
const envelope = {
  left: Math.min(...bounds.map(b => b.left)) - 8,
  top: Math.min(...bounds.map(b => b.top)) - 8,
  right: Math.max(...bounds.map(b => b.right)) + 8,
  bottom: Math.max(...bounds.map(b => b.bottom)) + 8,
};

/** Fit the maximum envelope once; growth never changes the timer anchor or scale. */
export function timelapsePetLayout(box: Rect) {
  const width = envelope.right - envelope.left, height = envelope.bottom - envelope.top;
  const scale = Math.min(box.width / width, box.height / height);
  return { scale, x: box.x + (box.width - width * scale) / 2 - envelope.left * scale,
    y: box.y + box.height - envelope.bottom * scale, availableHeight };
}
