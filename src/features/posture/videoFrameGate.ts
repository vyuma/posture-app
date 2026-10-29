/** A repeated video frame is not a fresh posture observation. */
export class VideoFrameGate {
  private time: number | null = null;
  reset() { this.time = null; }
  accept(time: number, usable: boolean) {
    if (!usable || !Number.isFinite(time) || this.time === time) return false;
    this.time = time;
    return true;
  }
}
