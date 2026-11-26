import { expect, test } from 'bun:test';
import { timelapseTimeline } from '../src/features/timelapse/timeline';

test('short recordings retain their duration; longer recordings cover the full source in one minute', () => {
  for (const seconds of [.01, 12, 59.99, 60, 60.01, 90, 120, 1800, 8400, 28800]) {
    const { duration, speed, frames } = timelapseTimeline(seconds);
    expect(duration).toBe(Math.min(seconds, 60));
    expect(speed).toBe(seconds <= 60 ? 1 : seconds / 60);
    expect(frames.length).toBeLessThanOrEqual(1800);
    expect(frames[0]).toEqual({ at: 0, duration: Math.min(1 / 30, duration), sourceAt: 0 });
    for (let index = 1; index < frames.length; index++) {
      expect(frames[index].at).toBeCloseTo(frames[index - 1].at + frames[index - 1].duration, 8);
      expect(frames[index].sourceAt).toBeCloseTo(frames[index].at * speed, 8);
    }
    const last = frames.at(-1)!;
    expect(last.at + last.duration).toBeCloseTo(duration, 8);
    expect(last.sourceAt + last.duration * speed).toBeCloseTo(seconds, 8);
  }
});
test('invalid source durations cannot produce a successful empty export', () => {
  for (const seconds of [0, -1, NaN, Infinity]) expect(() => timelapseTimeline(seconds)).toThrow();
});
