export type JudgmentSettings = { difficulty: 'easy' | 'normal' | 'hard'; dualMonitor: boolean };
export const DEFAULT_JUDGMENT: JudgmentSettings = { difficulty: 'normal', dualMonitor: false };
export function normalizeJudgment(value?: Partial<JudgmentSettings> | null): JudgmentSettings {
  return { difficulty: value?.difficulty === 'easy' || value?.difficulty === 'hard' ? value.difficulty : 'normal', dualMonitor: value?.dualMonitor === true };
}
export function judgmentScale(settings: JudgmentSettings) {
  return settings.difficulty === 'easy' ? 1.6 : settings.difficulty === 'hard' ? .65 : 1;
}
/** Relative yaw of the observed 3D ear-to-nose direction; not a clinical angle. */
export function relativeHeadYaw(x: number, z: number, baseX: number, baseZ: number): number | null {
  if (![x,z,baseX,baseZ].every(Number.isFinite) || Math.hypot(x,z) < .5 || Math.hypot(baseX,baseZ) < .5) return null;
  return Math.atan2(x*baseZ-z*baseX, x*baseX+z*baseZ)*180/Math.PI;
}
export const DUAL_MONITOR_YAW_DEG = 60;
