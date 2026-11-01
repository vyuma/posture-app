import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';

// Explicit local Windows/WebView2 integration check. No camera or collection writes.
// Start Tauri with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
// and open /dev/work in its main WebView. Then:
// $env:PIIIN_WINDOWS_WIDGET_CDP='9222'; bun test scripts/windows-widget.test.ts
const port = process.env.PIIIN_WINDOWS_WIDGET_CDP;
type Target = { url: string; webSocketDebuggerUrl: string };
async function connect(target: Target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = reject; });
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: unknown) => void }>();
  ws.onmessage = event => {
    const message = JSON.parse(String(event.data));
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    message.error ? call.reject(message.error) : call.resolve(message.result);
  };
  const send = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  return {
    close: () => ws.close(),
    evaluate: async (expression: string) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    },
  };
}

test.skipIf(!port)('Windows native widget keeps its screen anchor through growth and recovery', async () => {
  const targets: Target[] = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const mainTarget = targets.find(target => target.url === 'http://localhost:1420/dev/work');
  const overlayTarget = targets.find(target => target.url === 'http://localhost:1420/overlay.html');
  if (!mainTarget || !overlayTarget) throw new Error('Open the local Tauri /dev/work preview first');
  const main = await connect(mainTarget), overlay = await connect(overlayTarget);
  try {
    await main.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Widget').click()`);
    await Bun.sleep(1000);
    await overlay.evaluate(`(()=>{
      window.__widgetTrace=[]; window.__widgetRecording=true;
      function sample() {
        const bar=document.querySelector('.work-widget-bar'),rig=document.querySelector('.work-widget-rig');
        if(bar&&rig){const rect=bar.getBoundingClientRect();window.__widgetTrace.push({
          t:performance.now(),x:screenX,y:screenY,width:innerWidth,height:innerHeight,
          anchorX:screenX+rect.x,anchorY:screenY+rect.y,
          rigHeight:rig.getBoundingClientRect().height,rigLayoutWidth:rig.offsetWidth,rigLayoutHeight:rig.offsetHeight,
          pose:document.querySelector('.work-widget').className,
          settled:rig.getAttribute('data-settled-pose')
        });}
        if(window.__widgetRecording)requestAnimationFrame(sample);
      } sample();
    })()`);
    await main.evaluate(`(async()=>{
      const click=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text).click();
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      for(let i=0;i<2;i++){click('Angry');await wait(6000);click('Widget');await wait(4000);}
    })()`);
    const trace = await overlay.evaluate('window.__widgetRecording=false;window.__widgetTrace');
    const output = 'release-artifacts/windows-qa';
    await mkdir(output, { recursive: true });
    await writeFile(`${output}/after-trace.json`, JSON.stringify(trace, null, 2));
    expect(trace.length).toBeGreaterThan(300);
    expect(trace.every((frame: any) => frame.rigLayoutWidth === 860 && frame.rigLayoutHeight === 1280)).toBe(true);
    for (const key of ['x', 'y', 'width', 'height', 'anchorX', 'anchorY']) {
      const values = trace.map((frame: Record<string, number>) => frame[key]);
      expect(Math.max(...values) - Math.min(...values), key).toBeLessThanOrEqual(1);
    }
    let recoveries = 0;
    for (let index = 1; index < trace.length; index++) {
      if (trace[index].pose.includes('is-good') && trace[index - 1].pose.includes('is-bad')) {
        recoveries++;
        const start = trace[index];
        const middle = trace.find((frame: any) => frame.t > start.t + 150);
        const end = trace.find((frame: any) => frame.t > start.t + 750);
        expect(start.rigHeight).toBeGreaterThan(middle.rigHeight);
        expect(middle.rigHeight).toBeGreaterThan(end.rigHeight);
        const settled = trace.find((frame: any) => frame.t > start.t + 2800);
        expect(settled.settled).toBe('good');
      }
    }
    expect(recoveries).toBe(2);
  } finally {
    await overlay.evaluate('window.__widgetRecording=false').catch(() => {});
    main.close(); overlay.close();
  }
}, 35_000);
