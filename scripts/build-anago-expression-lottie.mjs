import { writeFileSync } from "node:fs";
import { POSES, WIDTH, HEIGHT } from "./anago-svg-source.mjs";
import { EXPRESSION_POSES, EXPRESSION_SOURCES } from "./anago-expression-source.mjs";
import { SEGMENTS, actingPose, makeSegmentLayers } from "./build-anago-overlay-lottie.mjs";

const names = { good: "good", bad: "angry", paused: "rest", happy: "happy" };
const replacement = pose => EXPRESSION_POSES[names[Object.entries(POSES).find(([, value]) => value === pose)[0]]];
let index = 1;
const layers = SEGMENTS.flatMap(segment => {
  const { start, end, marker } = segment;
  const from = replacement(segment.poses[0]), to = replacement(segment.poses.at(-1));
  const actingMarker = marker.replaceAll("bad", "angry").replaceAll("paused", "rest");
  const poses = segment.times
    ? segment.times.map(frame => actingPose(from, to, (frame - start) / (end - start), actingMarker))
    : [from];
  const result = makeSegmentLayers({ ...segment, marker: actingMarker, poses, clipBands: true }, () => index++);
  // Reserve room on the left for the supplied resting pose and its three Zs.
  // Every state receives the same offset, keeping the stem fixed during morphs.
  for (const layer of result) {
    const p = layer.ks.p;
    if (p.a) for (const key of p.k) for (const value of [key.s, key.e].filter(Boolean)) value[0] += 260;
    else p.k[0] += 260;
  }
  return result;
});
const animation = { v: "5.13.0", fr: 30, ip: 0, op: 408, w: WIDTH, h: HEIGHT,
  nm: "PiiiN / Rest and Angry State Transitions", ddd: 0, assets: [], layers,
  markers: [...SEGMENTS.map(s => ({ tm: s.start, cm: s.marker, dr: s.end - s.start + 1 })), { tm: 213, cm: "bad_to_good", dr: 75 }] };
const folder = new URL("../public/animations/anago/normal-nago/", import.meta.url);
writeFileSync(new URL("expression-states.json", folder), JSON.stringify(animation) + "\n");
writeFileSync(new URL("expression-states.sources.json", folder), JSON.stringify(EXPRESSION_SOURCES, null, 2) + "\n");
console.log(`Expression Lottie: ${layers.length} vector layers, ${animation.op} frames`);
