/** HTML media decoding fallback for recordings rejected by WebCodecs (for example VP9-in-MP4). */
export async function openVideoFrames(url: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  // WKWebView also needs an attached element to finish loading/seeking reliably.
  video.style.cssText = 'position:fixed;width:1px;height:1px;left:-2px;top:-2px;pointer-events:none;opacity:0';
  video.setAttribute('aria-hidden', 'true');
  document.body.append(video);
  function dispose() { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
  function wait(event: 'loadeddata' | 'seeked', action: () => void | Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      signal.throwIfAborted();
      const clear = () => { clearTimeout(timeout); video.removeEventListener(event, ready); video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); };
      const ready = () => { clear(); resolve(); };
      const failed = () => { clear(); reject(new Error('動画の映像を読み込めませんでした。もう一度お試しください。')); };
      const aborted = () => { clear(); reject(signal.reason); };
      const timeout = setTimeout(failed, 15_000);
      video.addEventListener(event, ready); video.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true });
      try { Promise.resolve(action()).catch(error => { clear(); reject(error); }); } catch (error) { clear(); reject(error); }
    });
  }
  try {
    await wait('loadeddata', () => { video.src = url; video.load(); });
    return {
      duration: video.duration, width: video.videoWidth, height: video.videoHeight,
      async at(time: number) {
        signal.throwIfAborted();
        // Seek once even at the beginning: WebKit may not expose pixels immediately after loadeddata.
        const target = Math.max(.00001, time);
        if (video.currentTime !== target) await wait('seeked', () => { video.currentTime = target; });
        signal.throwIfAborted();
        return video;
      }, dispose,
    };
  } catch (error) { dispose(); throw error; }
}
