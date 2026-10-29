// Append the missing upright sleep pose; all original transition layers stay intact.
import { readFileSync, writeFileSync } from 'node:fs';
import { POSES, color } from './anago-svg-source.mjs';
import { EXPRESSION_POSES } from './anago-expression-source.mjs';
import { actingPose, makeSegmentLayers } from './build-anago-overlay-lottie.mjs';
const folder = new URL('../public/animations/anago/normal-nago/', import.meta.url);
const animation = JSON.parse(readFileSync(new URL('expression-states.json', folder), 'utf8'));
const paused = { ...structuredClone(POSES.paused), bodyColor: color('#F78000'), eyeRotations: [0, 0] };
const poses = { good: EXPRESSION_POSES.good, bad: EXPRESSION_POSES.angry, rest: EXPRESSION_POSES.rest, paused };
let index = Math.max(...animation.layers.map(layer => layer.ind)) + 1;
function append(start, end, from, to, marker) {
  const times = from === to ? undefined : Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const sampled = times ? times.map(frame => actingPose(poses[from], poses[to], (frame - start) / (end - start), marker)) : [poses[from]];
  const layers = makeSegmentLayers({ name: marker, start, end, marker, times, poses: sampled, clipBands: true }, () => index++);
  for (const layer of layers) {
    const position = layer.ks.p;
    if (position.a) for (const key of position.k) for (const value of [key.s, key.e].filter(Boolean)) value[0] += 260;
    else position.k[0] += 260;
  }
  animation.layers.push(...layers);
  animation.markers.push({ tm: start, cm: marker, dr: end - start + 1 });
}
append(408, 408, 'paused', 'paused', 'widget_paused');
for (const [i, pair] of [['good','paused'],['paused','good'],['bad','paused'],['paused','bad'],['rest','paused'],['paused','rest']].entries()) {
  append(409 + i * 30, 438 + i * 30, ...pair, `widget_${pair.join('_to_')}`);
}
animation.op = 589;
animation.h = 1280; // Reveal more of the same long stem at the enlarged widget size.
animation.nm = 'PiiiN widget / preserved transitions + upright pause';
writeFileSync(new URL('widget-states-v2.json', folder), JSON.stringify(animation) + '\n');
console.log(`Widget rig: ${animation.layers.length} layers / ${animation.op} frames`);
