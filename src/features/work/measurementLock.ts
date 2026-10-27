/** Keep ownership only while measuring. Browsing the collection never blocks another tab. */
export function acquireMeasurementLock(): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.resolve(() => {});
  return new Promise((resolve, reject) => {
    void navigator.locks.request('piiin-measurement-owner-v1', { ifAvailable: true }, async lock => {
      if (!lock) { resolve(null); return; }
      await new Promise<void>(release => resolve(release));
    }).catch(reject);
  });
}
