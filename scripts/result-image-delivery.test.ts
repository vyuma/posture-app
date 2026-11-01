import { beforeEach, describe, expect, mock, test } from 'bun:test';

const nativeCopy = mock(async () => false);
const preferNative = mock(() => false);
const nativeSave = mock(async (): Promise<'downloaded' | 'aborted' | undefined> => undefined);
mock.module('../src/lib/shareNativeClipboard', () => ({ copyShareImageNative: nativeCopy, shouldPreferNativeClipboardShare: preferNative, saveResultImageNative: nativeSave }));
const { deliverResultImage } = await import('../src/lib/resultImageDelivery');
const png = new Blob(['test-png'], { type: 'image/png' });
let writes: Array<Array<{ data: Record<string, Promise<Blob>> }>>;
let shares: ShareData[];
let downloads: string[];
let clipboardFails = false;
let shareAborted = false;
function environment(userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints = 0) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    userAgent, maxTouchPoints,
    clipboard: { write: mock(async (items: typeof writes[number]) => { writes.push(items); if (clipboardFails) throw new Error('denied'); await items[0].data['image/png']; }) },
    canShare: () => true,
    share: mock(async (data: ShareData) => { shares.push(data); if (shareAborted) throw new DOMException('cancel', 'AbortError'); }),
  } });
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: class {
    static supports = () => true;
    constructor(public data: Record<string, Promise<Blob>>) {}
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body: { appendChild() {} },
    createElement: () => ({ href: '', download: '', rel: '', style: {}, click() { downloads.push(this.download); }, remove() {} }),
  } });
}
beforeEach(() => { writes=[]; shares=[]; downloads=[]; clipboardFails=false; shareAborted=false; nativeCopy.mockClear(); nativeSave.mockReset(); nativeSave.mockResolvedValue(undefined); preferNative.mockReturnValue(false); environment(); });
describe('result image delivery', () => {
  test('desktop auto writes exactly one PNG immediately without the OS share sheet', async () => {
    let finish!: (blob: Blob) => void;
    const pending = new Promise<Blob>(resolve => { finish = resolve; });
    const outcome = deliverResultImage(pending, 'auto');
    expect(writes).toHaveLength(1); // Must retain the click gesture, before capture resolves.
    expect(writes[0]).toHaveLength(1);
    expect(Object.keys(writes[0][0].data)).toEqual(['image/png']);
    expect(shares).toHaveLength(0);
    finish(png);
    expect(await outcome).toBe('copied');
    expect(downloads).toHaveLength(0);
  });
  test('mobile shares a single file without a second text or URL representation', async () => {
    environment('Mozilla/5.0 (iPhone)', 5);
    expect(await deliverResultImage(Promise.resolve(png), 'auto')).toBe('shared');
    expect(shares).toHaveLength(1);
    expect(Object.keys(shares[0])).toEqual(['files']);
    expect(shares[0].files).toHaveLength(1);
    expect(writes).toHaveLength(0);
  });
  test('iPad desktop user agent retains its native share sheet', async () => {
    environment('Mozilla/5.0 (Macintosh)', 5);
    expect(await deliverResultImage(Promise.resolve(png), 'auto')).toBe('shared');
    expect(writes).toHaveLength(0);
  });
  test('cancelled share never copies or downloads another image', async () => {
    shareAborted = true;
    expect(await deliverResultImage(Promise.resolve(png), 'share')).toBe('aborted');
    expect(writes).toHaveLength(0); expect(downloads).toHaveLength(0);
  });
  test('clipboard rejection downloads once without invoking the share sheet', async () => {
    clipboardFails = true;
    expect(await deliverResultImage(Promise.resolve(png), 'auto')).toBe('downloaded');
    expect(writes).toHaveLength(1); expect(downloads).toHaveLength(1); expect(shares).toHaveLength(0);
  });
  test('Tauri copies with its native adapter once', async () => {
    preferNative.mockReturnValue(true); nativeCopy.mockResolvedValueOnce(true);
    expect(await deliverResultImage(Promise.resolve(png), 'auto')).toBe('copied');
    expect(nativeCopy).toHaveBeenCalledTimes(1); expect(writes).toHaveLength(0); expect(shares).toHaveLength(0);
  });
  test('save does not touch clipboard or share', async () => {
    expect(await deliverResultImage(Promise.resolve(png), 'download')).toBe('downloaded');
    expect(downloads).toHaveLength(1); expect(writes).toHaveLength(0); expect(shares).toHaveLength(0);
  });
});


describe('Store image save acknowledgement', () => {
  test('does not report saved or start a browser download before native save completes', async () => {
    let finish!: (result: 'downloaded') => void;
    nativeSave.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let completed = false;
    const saving = deliverResultImage(Promise.resolve(png), 'download').then(value => { completed = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(nativeSave).toHaveBeenCalledTimes(1);
    expect(completed).toBe(false);
    expect(downloads).toHaveLength(0);
    finish('downloaded');
    expect(await saving).toBe('downloaded');
  });
  test('cancelling the native panel does not download or report success', async () => {
    nativeSave.mockResolvedValueOnce('aborted');
    expect(await deliverResultImage(Promise.resolve(png), 'download')).toBe('aborted');
    expect(downloads).toHaveLength(0);
  });
  test('native write failure propagates instead of falling back to a false browser success', async () => {
    nativeSave.mockRejectedValueOnce(new Error('disk write failed'));
    await expect(deliverResultImage(Promise.resolve(png), 'download')).rejects.toThrow('disk write failed');
    expect(downloads).toHaveLength(0);
  });
  test('clipboard failure uses the same confirmed save path', async () => {
    clipboardFails = true;
    nativeSave.mockResolvedValueOnce('downloaded');
    expect(await deliverResultImage(Promise.resolve(png), 'auto')).toBe('downloaded');
    expect(nativeSave).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(0);
  });
});
