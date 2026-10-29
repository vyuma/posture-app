import { widgetPose, WIDGET_STILL, WIDGET_TRANSITIONS, type WidgetPose } from '../work/widgetPresentation';
import type { WidgetState } from '../work/Widget';
import type { SpeechEvent } from '../posture/feedbackSpeech';

export type Rect = { x: number; y: number; width: number; height: number };
export type TimelapseSettings = { enabled: boolean; quality: 720 | 1080; includePet: boolean; includeScene: boolean; camera: Rect; pet: Rect };
export const DEFAULT_TIMELAPSE: TimelapseSettings = { enabled: false, quality: 720, includePet: false, includeScene: false,
  camera: { x: 0, y: 0, width: 1, height: 1 }, pet: { x: .72, y: .25, width: .24, height: .6 } };
export const SPEEDS = [1, 2, 4, 6, 8, 16] as const;
export const ASSET_VERSION = 'widget-states-v2';
export type Pose = WidgetPose;
export type PetEvent = { widgetVersion?: 2; feedbackVersion?: 1; speech?: SpeechEvent | null; at: number; pose: Pose; from: Pose; transitionAt: number; badAt: number | null; remainingMs: number; cycle: number; cycles: number; durationMs: number; visible: boolean; reduced: boolean };
export type Clip = { id: string; epoch: number; sessionId: string; generation: number; state: 'recording' | 'ready' | 'partial' | 'failed'; mime: string; file: string; width: number; height: number; duration: number; bytes: number; createdAt: string; assetVersion: string; events: PetEvent[]; error?: string };
export function clampRect(rect: Rect): Rect {
  const width = Math.max(.12, Math.min(1, Number.isFinite(rect.width) ? rect.width : .3));
  const height = Math.max(.12, Math.min(1, Number.isFinite(rect.height) ? rect.height : .3));
  return { width, height, x: Math.max(0, Math.min(1 - width, Number.isFinite(rect.x) ? rect.x : 0)), y: Math.max(0, Math.min(1 - height, Number.isFinite(rect.y) ? rect.y : 0)) };
}
export function loadTimelapseSettings(): TimelapseSettings {
  try { const value = JSON.parse(localStorage.getItem('piiin.timelapse.settings.v1') ?? 'null');
    if (!value) return structuredClone(DEFAULT_TIMELAPSE);
    return { enabled: value.enabled === true, quality: value.quality === 1080 ? 1080 : 720, includePet: value.includePet === true, includeScene: value.includeScene === true, camera: clampRect(value.camera ?? DEFAULT_TIMELAPSE.camera), pet: clampRect(value.pet ?? DEFAULT_TIMELAPSE.pet) };
  } catch { return structuredClone(DEFAULT_TIMELAPSE); }
}
export function saveTimelapseSettings(value: TimelapseSettings) { localStorage.setItem('piiin.timelapse.settings.v1', JSON.stringify(value)); }
export function petEvent(at: number, widget: WidgetState, previous?: PetEvent, visible = true, reduced = false, now = Date.now()): PetEvent {
  const pose = widgetPose(widget);
  const changed = previous?.pose !== pose;
  // Convert the shared wall clock into the recording's stitched focus timeline once per utterance.
  const speech = widget.speech ? previous?.speech?.id === widget.speech.id ? previous.speech : { ...widget.speech,
    startedAt: at * 1000 - (now - widget.speech.startedAt), endsAt: at * 1000 - (now - widget.speech.endsAt) } : null;
  return { widgetVersion: 2, ...(widget.feedbackVersion === 1 ? { feedbackVersion: 1 as const, speech } : {}), at, pose, from: changed ? previous?.pose ?? pose : previous.from, transitionAt: changed ? at : previous.transitionAt,
    badAt: pose === 'bad' ? (previous?.pose === 'bad' ? previous.badAt : at - Math.max(0, Date.now() - (widget.badSince ?? Date.now())) / 1000) : null,
    remainingMs: widget.remainingMs, cycle: widget.cycle, cycles: widget.cycles, durationMs: widget.durationMs, visible, reduced };
}
export function eventAt(events: PetEvent[], seconds: number): PetEvent | undefined {
  let lo = 0, hi = events.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >>> 1; if (events[mid].at <= seconds) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found < 0 ? undefined : events[found];
}
const transitions: Record<string, [number, number]> = { 'good:bad': [183, 212], 'bad:good': [213, 287], 'good:paused': [288, 317], 'paused:good': [318, 347], 'bad:paused': [348, 377], 'paused:bad': [378, 407] };
function easeInOut(x: number) {
  // CSS ease-in-out = cubic-bezier(.42, 0, .58, 1), as used by work-pet-shake.
  let lo = 0, hi = 1;
  for (let step = 0; step < 16; step++) { const t = (lo + hi) / 2; const at = 3 * (1 - t) ** 2 * t * .42 + 3 * (1 - t) * t * t * .58 + t ** 3; if (at < x) lo = t; else hi = t; }
  const t = (lo + hi) / 2; return 3 * (1 - t) * t * t + t ** 3;
}
export function replayPet(events: PetEvent[], seconds: number, fps = 30) {
  const event = eventAt(events, seconds); if (!event) return null;
  const elapsed = Math.max(0, seconds - event.transitionAt);
  const segment = (event.widgetVersion === 2 ? WIDGET_TRANSITIONS : transitions)[`${event.from}:${event.pose}`];
  const frame = !event.reduced && segment ? Math.min(segment[1] - .001, segment[0] + elapsed * fps) : (event.widgetVersion === 2 ? WIDGET_STILL : { good: 0, bad: 1, paused: 2, rest: 2 })[event.pose];
  const badElapsed = Math.max(0, seconds - (event.badAt ?? seconds));
  const wave = (badElapsed % .56) / .28;
  const eased = easeInOut(Math.min(wave, 2 - wave));
  const beats = [[0,0],[.12,-1.2],[.26,1.6],[.40,-1.6],[.55,1.3],[.70,-.9],[.84,.6],[1,0]];
  const phase = (badElapsed % .68) / .68;
  const beat = beats.findIndex(point => point[0] > phase);
  const [start, a] = beats[Math.max(0, beat - 1)], [end, b] = beats[Math.max(1, beat)];
  const currentAngle = a + (b - a) * easeInOut((phase - start) / (end - start));
  return { ...event, frame, growth: event.reduced || event.pose !== 'bad' ? 0 : Math.min(1, badElapsed / 5), angle: event.reduced || event.pose !== 'bad' ? 0 : event.widgetVersion === 2 ? currentAngle : -2 + 4 * eased,
    remainingMs: Math.max(0, event.remainingMs - (event.widgetVersion === 2 && event.pose === 'paused' ? 0 : seconds - event.at) * 1000) };
}
export function videoTime(seconds: number) { const total = Math.max(0, Math.floor(seconds)); return total >= 3600 ? `${Math.floor(total / 3600)}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` : `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; }
