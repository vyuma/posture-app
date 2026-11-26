export function shouldPreferNativeClipboardShare() { return false; }
export async function copyShareImageNative(_blob:Blob) { return false; }
export async function saveResultImageNative(_blob:Blob):Promise<'downloaded'|'aborted'|undefined> { return undefined; }
