import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { EXPRESSION_POSES as POSES } from "./anago-expression-source.mjs";
import { actingPose, makeSegmentLayers } from "./build-anago-overlay-lottie.mjs";

// Reuse the desktop pet's SVG rig, spine-bound stripes, blink and follow-through.
// Endpoints are placed in the 1512 × 982 story artboard, not the pet viewport.
function placedPose(source, scale, x, y, mirror = false) {
  const pose = structuredClone(source);
  const sx = mirror ? -scale : scale;
  const point = ([a, b]) => [a * sx + x, b * scale + y];
  const shape = (p) => ({ ...p, v: p.v.map(point),
    i: p.i.map(([a, b]) => [a * sx, b * scale]),
    o: p.o.map(([a, b]) => [a * sx, b * scale]) });
  pose.body = shape(pose.body);
  pose.stripes = pose.stripes.map(band => {
    const p = shape(band.path);
    // Preserve matching corner order across the mirrored intro and happy pose.
    if (mirror) for (const key of ["v", "i", "o"]) p[key] = [1, 0, 3, 2].map(i => p[key][i]);
    return { ...band, path: p };
  });
  for (const key of ["eyes", "cheeks"]) pose[key] = pose[key].map(point);
  for (const key of ["closedEyes", "zs"]) pose[key] = pose[key].map(shape);
  // Mirroring swaps left/right identity. Keep corresponding eyes and cheeks
  // on the same side during the morph so they never cross through each other.
  if (mirror) for (const key of ["eyes", "cheeks", "closedEyes"]) pose[key].reverse();
  if (mirror) pose.eyeRotations = pose.eyeRotations.map(r => -r).reverse();
  for (const key of ["bodyWidth", "eyeStroke", "closedEyeStroke", "zStroke"]) pose[key] *= scale;
  for (const key of ["eyeSize", "cheekSize"]) pose[key] = pose[key].map(v => v * scale);
  return pose;
}

const introScale = 405.78 / 636;
const happyScale = 146.662 / 226;
const intro = placedPose(POSES.good, introScale, 250.6 + 405.78 + 32 * introScale, 331, true);
const happy = placedPose(POSES.happy, happyScale,
  421.25 + 87.7928 - POSES.happy.body.v.at(-1)[0] * happyScale,
  386.36 + 87.7928 - POSES.happy.body.v.at(-1)[1] * happyScale);
const angryScale = 146.064 / 226;
const angry = placedPose(POSES.angry, angryScale,
  541.0035 + POSES.angry.body.v.at(-1)[0] * angryScale,
  432.2771 - POSES.angry.body.v.at(-1)[1] * angryScale, true);
const STORY_HEIGHT = 4000;
function extendStem(source) {
  const pose = structuredClone(source);
  const body = pose.body;
  // Append below the original rig AFTER the bend and stripe binding. Keep
  // every original curve, head, face and stripe exactly where it was.
  const [x, y] = body.v[0];
  body.i[0] = [0, (STORY_HEIGHT - y) / 3];
  body.v.unshift([x, STORY_HEIGHT]);
  body.i.unshift([0, 0]);
  body.o.unshift([0, (y - STORY_HEIGHT) / 3]);
  return pose;
}
const times = Array.from({ length: 31 }, (_, i) => i);
const segment = { name: "Story / Intro to Happy", marker: "story_intro_to_happy", start: 0, end: 30, times,
  poses: times.map(frame => extendStem(actingPose(intro, happy, frame / 30, "bad_to_happy"))),
  eases: times.slice(1).map(() => ({ x1: 0, y1: 0, x2: 1, y2: 1 })) };
const angryTimes = times.map(t => t + 31);
const angrySegment = { name: "Story / Happy to Angry", marker: "story_happy_to_angry", start: 31, end: 61, times: angryTimes,
  poses: times.map(frame => extendStem(actingPose(happy, angry, frame / 30, "happy_to_angry"))),
  eases: segment.eases, clipBands: true };
let index = 1;
// The story viewport clips the long body; extra composition height also keeps
// it continuous below the fold in the mobile reflow.
const animation = { v: "5.13.0", fr: 30, ip: 0, op: 62, w: 1512, h: STORY_HEIGHT,
  nm: "PiiiN Story / Desktop Pet Pose Transition", ddd: 0, assets: [],
  layers: [segment, angrySegment].flatMap(s => makeSegmentLayers(s, () => index++)),
  markers: [{ tm: 0, cm: "intro", dr: 1 }, { tm: 30, cm: "happy", dr: 1 }, { tm: 61, cm: "angry", dr: 1 }] };
const folder = new URL("../public/story/redesign/", import.meta.url);
mkdirSync(folder, { recursive: true });
writeFileSync(new URL("story-poses.json", folder), JSON.stringify(animation) + "\n");
console.log(`Story Lottie: ${animation.layers.length} vector layers, 62 frames, no raster assets`);

// The loading/error fallback uses the exact first Lottie pose, including its
// long stem. A cropped catalog portrait exposes a flat edge during the pop.
function svgPath(shape) {
  const commands = [`M${shape.v[0].join(" ")}`];
  for (let i = 1; i < shape.v.length; i++) {
    const previous = shape.v[i - 1], point = shape.v[i];
    commands.push(`C${previous.map((v, a) => v + shape.o[i - 1][a]).join(" ")} ${point.map((v, a) => v + shape.i[i][a]).join(" ")} ${point.join(" ")}`);
  }
  return commands.join(" ") + (shape.c ? " Z" : "");
}
const first = segment.poses[0];
const bodyColor = `rgb(${first.bodyColor.slice(0, 3).map(v => Math.round(v * 255)).join(" ")})`;
const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1512 ${STORY_HEIGHT}">
<path d="${svgPath(first.body)}" fill="none" stroke="${bodyColor}" stroke-width="${first.bodyWidth}" stroke-linecap="round"/>
${first.stripes.map(band => `<path d="${svgPath(band.path)}" fill="#fff" opacity="${band.opacity / 100}"/>`).join("\n")}
${first.eyes.map(([cx, cy]) => `<ellipse cx="${cx}" cy="${cy}" rx="${first.eyeSize[0] / 2}" ry="${first.eyeSize[1] / 2}" fill="#505050" stroke="#fff" stroke-width="${first.eyeStroke}"/>`).join("\n")}
</svg>\n`;
writeFileSync(new URL("intro-story.svg", folder), fallback);

// Extend only the export clipping region for the story fallback. All supplied
// body/eye paths stay untouched; the viewport must continue below the fold.
const angrySvg = readFileSync(new URL("../public/characters/anago/normal-nago/expressions/angry.svg", import.meta.url), "utf8")
  .replace('viewBox="0 0 158.74 255.12"', 'viewBox="0 0 158.74 800"')
  .replace('height="300.91"', 'height="845.79"');
writeFileSync(new URL("angry-story.svg", folder), angrySvg);
