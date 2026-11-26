import { DEFAULT_JUDGMENT, DUAL_MONITOR_YAW_DEG, judgmentScale, type JudgmentSettings } from './judgment';
import { REASONS } from './feedback';
import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { evaluatePostureFrame } from './engine';
import type { PostureEngineState } from './engine.types';
import { FeedbackObserver } from './feedback';

/** One decoded camera frame supplies both the decision and its explanation. */
export function evaluatePostureObservation(
  previous: PostureEngineState,
  observer: FeedbackObserver,
  now: number,
  image: NormalizedLandmark[] | null,
  world: Landmark[] | null,
  camera: { width: number; height: number; id: string },
  judgment: JudgmentSettings = DEFAULT_JUDGMENT,
) {
  // The observer has its own stricter visibility/geometry checks. Calibration
  // uses only camera frames, never repeated UI snapshots or wall-clock timers.
  let feedback = observer.observe(image, world, camera.width, camera.height,
    camera.id, previous.baseline !== null, true, now);
  const scale = judgmentScale(judgment);
  for (const reason of REASONS) if (feedback.evidence[reason] !== null) feedback.evidence[reason] /= scale;
  if (judgment.dualMonitor) {
    const yaw = feedback.headYawDeg;
    feedback.evidence.headTurn = yaw == null ? null : Math.abs(yaw) <= DUAL_MONITOR_YAW_DEG + 1e-6 ? 0 : Math.abs(yaw)/DUAL_MONITOR_YAW_DEG;
  }
  const evaluated = evaluatePostureFrame(previous, now, image, world,
    feedback.baselineReady && feedback.available ? feedback.evidence.headTilt : null, judgment, feedback.headYawDeg ?? null);
  if (!previous.baseline && evaluated.result.baselineReady) {
    // Finalize before the UI captures the newly registered baseline. This ready
    // observation does not append another sample; it seals the existing ones.
    feedback = observer.observe(image, world, camera.width, camera.height,
      camera.id, true, evaluated.result.eval.qualityOk, now);
  }
  return { ...evaluated, feedback };
}
