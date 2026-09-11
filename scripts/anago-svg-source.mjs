/* global URL, structuredClone */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const WIDTH = 860;
export const HEIGHT = 1022;
const BODY_WIDTH = 226;
const ROOT_X = 390;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const equal = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-8);

export const path = (vertices, incoming, outgoing, closed = false) => ({
  v: vertices,
  i: incoming ?? vertices.map(() => [0, 0]),
  o: outgoing ?? vertices.map(() => [0, 0]),
  c: closed,
});

// This importer deliberately supports only the primitives in the supplied
// Illustrator files. Unsupported geometry fails instead of approximating it.
function attributes(text) {
  return Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
}

function readSource(name) {
  const file = fileURLToPath(new URL(`../public/characters/anago/normal-nago/expressions/${name}.svg`, import.meta.url));
  const text = readFileSync(file, "utf8");
  if (!text.includes("<svg") || /<(?:image|text|use)\b|\btransform=/.test(text)) {
    throw new Error(`Unsupported source geometry: ${file}`);
  }
  const rules = [];
  for (const style of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of style[1].matchAll(/([^{}]+)\{([^}]+)\}/g)) {
      rules.push({
        classes: [...rule[1].matchAll(/\.([\w-]+)/g)].map(m => m[1]),
        values: Object.fromEntries(rule[2].trim().split(";").filter(s => s.trim()).map(s => {
          const at = s.indexOf(":");
          return [s.slice(0, at).trim(), s.slice(at + 1).trim()];
        })),
      });
    }
  }
  const markup = text.replace(/<defs>[\s\S]*?<\/defs>/g, "");
  const elements = [...markup.matchAll(/<(path|rect|circle|ellipse|polygon|polyline)\b([^>]*)\/?\s*>/g)].map(m => {
    const attrs = attributes(m[2]);
    const classes = (attrs.class ?? "").split(/\s+/);
    const style = Object.assign({}, ...rules.filter(r => r.classes.some(c => classes.includes(c))).map(r => r.values));
    return { tag: m[1], attrs, style };
  });
  const viewBox = attributes(text.match(/<svg\b[^>]*>/)[0]).viewBox.split(/\s+/).map(Number);
  return { file, text, viewBox, elements, hash: createHash("sha256").update(text).digest("hex") };
}

function cubicPath(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);
  let index = 0;
  let command;
  let current = [0, 0];
  let previousControl = null;
  const segments = [];
  const point = relative => {
    const p = [Number(tokens[index++]), Number(tokens[index++])];
    return relative ? add(current, p) : p;
  };
  const line = end => [current, mix(current, end, 1 / 3), mix(current, end, 2 / 3), end];
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    const kind = command.toUpperCase();
    let segment;
    if (kind === "M") {
      current = point(relative);
      command = relative ? "l" : "L";
      previousControl = null;
      continue;
    }
    if (kind === "L") segment = line(point(relative));
    else if (kind === "H") segment = line([Number(tokens[index++]) + (relative ? current[0] : 0), current[1]]);
    else if (kind === "V") segment = line([current[0], Number(tokens[index++]) + (relative ? current[1] : 0)]);
    else if (kind === "C") segment = [current, point(relative), point(relative), point(relative)];
    else if (kind === "S") segment = [current, previousControl ? sub(current.map(v => 2 * v), previousControl) : current, point(relative), point(relative)];
    else throw new Error(`Unsupported SVG path command ${command}`);
    if (!segment.every(p => p.every(Number.isFinite))) throw new Error(`Invalid SVG path: ${d}`);
    current = segment[3];
    previousControl = kind === "C" || kind === "S" ? segment[2] : null;
    if (!segment.every(p => equal(p, segment[0]))) segments.push(segment);
  }
  return segments;
}

function splitCubic([a, b, c, d], t = 0.5) {
  const ab = mix(a, b, t), bc = mix(b, c, t), cd = mix(c, d, t);
  const abc = mix(ab, bc, t), bcd = mix(bc, cd, t);
  const mid = mix(abc, bcd, t);
  return [[a, ab, abc, mid], [mid, bcd, cd, d]];
}

function toLottie(segments) {
  const vertices = [segments[0][0], ...segments.map(s => s[3])];
  const result = path(vertices);
  segments.forEach((s, i) => {
    result.o[i] = sub(s[1], s[0]);
    result.i[i + 1] = sub(s[2], s[3]);
  });
  return result;
}

export function transformPath(shape, scale = 1, offset = [0, 0]) {
  return {
    c: shape.c,
    v: shape.v.map(p => add(p.map(v => v * scale), offset)),
    i: shape.i.map(p => p.map(v => v * scale)),
    o: shape.o.map(p => p.map(v => v * scale)),
  };
}

function bodyPath(element, scale, offset) {
  const raw = cubicPath(element.attrs.d);
  // Merge the redundant, collinear vertical commands from good.svg exactly.
  let count = 0;
  while (count < raw.length && raw[count].every(p => Math.abs(p[0] - raw[0][0][0]) < 1e-8)) count++;
  const start = raw[0][0];
  const end = raw[count - 1][3];
  const vertical = [start, mix(start, end, 1 / 3), mix(start, end, 2 / 3), end];
  let crown = raw.slice(count);
  if (crown.length === 1) crown = splitCubic(crown[0]);
  if (crown.length !== 2) throw new Error("Expected the supplied two-part head curve");
  // All poses get the same topology through exact de Casteljau subdivision.
  // No resampling or hand-authored replacement points change the silhouette.
  const splitY = (1120 - offset[1]) / scale;
  const t = (splitY - start[1]) / (end[1] - start[1]);
  if (!(t > 0 && t < 1)) throw new Error("Body split must stay on the source line");
  return transformPath(toLottie([...splitCubic(vertical, t), ...crown]), scale, offset);
}

const number = (element, key) => Number(element.attrs[key]);
const strokeWidth = element => parseFloat(element.style["stroke-width"]);
const color = hex => {
  const value = hex.slice(1);
  const full = value.length === 3 ? [...value].map(c => c + c).join("") : value;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255).concat(1);
};

const sources = Object.fromEntries(["good", "bad", "paused", "happy"].map(name => [name, readSource(name)]));
const bodies = Object.fromEntries(["good", "bad", "paused", "happy"].map(name => [name, sources[name].elements.find(e => e.tag === "path" && e.style.stroke === "#f78000")]));
const sourceSpines = Object.fromEntries(Object.entries(bodies).map(([name, body]) => [name, cubicPath(body.attrs.d)]));
const sourceRoot = name => sourceSpines[name][0][0];
const sourceHead = name => sourceSpines[name].at(-1)[3];
const goodScale = BODY_WIDTH / strokeWidth(bodies.good);
const goodOffset = [ROOT_X - sourceRoot("good")[0] * goodScale, 182 - sourceHead("good")[1] * goodScale];
// bad.svg has a different export scale: normalize uniformly, then align the
// stem and the source viewport bottom. Its four original bands stay visible.
const badScale = BODY_WIDTH / strokeWidth(bodies.bad);
const badOffset = [ROOT_X - sourceRoot("bad")[0] * badScale, HEIGHT - sources.bad.viewBox[3] * badScale];
const happyScale = BODY_WIDTH / strokeWidth(bodies.happy);
const transforms = {
  good: { scale: goodScale, offset: goodOffset },
  bad: { scale: badScale, offset: badOffset },
  paused: { scale: goodScale, offset: [ROOT_X - sourceRoot("paused")[0] * goodScale, 182 - sourceHead("paused")[1] * goodScale] },
  happy: { scale: happyScale, offset: [ROOT_X - sourceRoot("happy")[0] * happyScale, HEIGHT - sources.happy.viewBox[3] * happyScale] },
};

function bands(source, { scale, offset }) {
  return source.elements.filter(e => ["rect", "polygon"].includes(e.tag) && e.style.fill === "#fff").map(e => {
    let vertices;
    if (e.tag === "rect") {
      const x = number(e, "x"), y = number(e, "y"), w = number(e, "width"), h = number(e, "height");
      vertices = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    } else {
      const values = e.attrs.points.trim().split(/[\s,]+/).map(Number);
      vertices = Array.from({ length: values.length / 2 }, (_, i) => values.slice(i * 2, i * 2 + 2));
      if (equal(vertices[0], vertices.at(-1))) vertices.pop();
      // Clockwise winding alone is insufficient: each pose must also begin
      // at its upper-left corner, or the interpolated band twists one vertex.
      const cx = vertices.reduce((s, p) => s + p[0], 0) / vertices.length;
      const cy = vertices.reduce((s, p) => s + p[1], 0) / vertices.length;
      vertices.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
      const first = vertices.reduce((best, p, i) => p[1] < vertices[best][1] || (p[1] === vertices[best][1] && p[0] < vertices[best][0]) ? i : best, 0);
      vertices = [...vertices.slice(first), ...vertices.slice(0, first)];
    }
    if (vertices.length !== 4) throw new Error("Expected a four-point designer band");
    return { path: transformPath(path(vertices, undefined, undefined, true), scale, offset), opacity: 100 };
  }).sort((a, b) => Math.min(...a.path.v.map(p => p[1])) - Math.min(...b.path.v.map(p => p[1])));
}

function openPose(name) {
  const source = sources[name];
  const transform = transforms[name];
  const { scale, offset } = transform;
  const eyes = source.elements.filter(e => ["circle", "ellipse"].includes(e.tag) && e.style.fill === "#505050").sort((a, b) => number(a, "cx") - number(b, "cx"));
  if (eyes.length !== 2) throw new Error(`Expected two original eyes in ${name}.svg`);
  const eye = eyes[0];
  const rx = Number(eye.attrs.rx ?? eye.attrs.r), ry = Number(eye.attrs.ry ?? eye.attrs.r);
  return {
    bodyWidth: BODY_WIDTH,
    body: bodyPath(bodies[name], scale, offset),
    stripes: bands(source, transform),
    eyes: eyes.map(e => add([number(e, "cx") * scale, number(e, "cy") * scale], offset)),
    eyeSize: [rx * 2 * scale, ry * 2 * scale],
    eyeStroke: strokeWidth(eye) * scale,
    openEyesOpacity: 100, closedEyesOpacity: 0,
    cheekOpacity: 0, zOpacity: 0,
  };
}

const good = openPose("good");
const bad = openPose("bad");
const happy = openPose("happy");
if (good.stripes.length !== 5 || bad.stripes.length !== 4 || happy.stripes.length !== 3) throw new Error("Designer band count changed; review pose correspondence");
// An invisible fifth band supplies matching topology; it is below the viewport
// in good.svg and is never substituted for any of bad.svg's four real bands.
bad.stripes.push({ path: transformPath(bad.stripes.at(-1).path, 1, [0, 180]), opacity: 0 });
const happyBandSpacing = happy.stripes[2].path.v[0][1] - happy.stripes[1].path.v[0][1];
while (happy.stripes.length < good.stripes.length) {
  happy.stripes.push({ path: transformPath(happy.stripes.at(-1).path, 1, [0, happyBandSpacing]), opacity: 0 });
}
const closed = sources.paused.elements.filter(e => e.tag === "path" && e.style.stroke === "#fff");
const zs = sources.paused.elements.filter(e => e.tag === "polyline").sort((a, b) => parseFloat(a.attrs.points) - parseFloat(b.attrs.points));
if (closed.length !== 2 || zs.length !== 3) throw new Error("Expected two closed eyes and three original Z shapes");
const closedTemplate = toLottie(cubicPath(closed[0].attrs.d));
const closedCenter = [(closedTemplate.v[0][0] + closedTemplate.v.at(-1)[0]) / 2, closedTemplate.v[0][1]];
const cheeks = sources.happy.elements.filter(e => e.tag === "circle" && e.style["mix-blend-mode"] === "multiply").sort((a, b) => number(a, "cx") - number(b, "cx"));
if (cheeks.length !== 2) throw new Error("Expected the two original blush circles");
const happyCheeks = cheeks.map(e => add([number(e, "cx") * happyScale, number(e, "cy") * happyScale], transforms.happy.offset));
for (const pose of [good, bad, happy]) {
  pose.closedEyes = pose.eyes.map(p => transformPath(closedTemplate, goodScale, sub(p, closedCenter.map(v => v * goodScale))));
  pose.closedEyeStroke = strokeWidth(closed[0]) * goodScale;
  pose.zs = zs.map(e => {
    const values = e.attrs.points.trim().split(/[\s,]+/).map(Number);
    return transformPath(path(Array.from({ length: values.length / 2 }, (_, i) => values.slice(i * 2, i * 2 + 2))), goodScale, transforms.paused.offset);
  });
  pose.zStroke = strokeWidth(zs[0]) * goodScale;
  // Keep each cheek attached to its corresponding eye while recovering.
  pose.cheeks = pose.eyes.map((eye, i) => add(eye, sub(happyCheeks[i], happy.eyes[i])));
  pose.cheekSize = [2 * number(cheeks[0], "r") * happyScale, 2 * number(cheeks[0], "r") * happyScale];
}
happy.cheeks = happyCheeks;
happy.cheekOpacity = Number(cheeks[0].style.opacity) * 100;

// Explicit product requirement: good -> paused changes only the face and Zs.
const paused = structuredClone(good);
paused.openEyesOpacity = 0;
paused.closedEyesOpacity = 100;
paused.zOpacity = 100;

export const POSES = { good, bad, paused, happy };
export const COLORS = {
  body: color(bodies.good.style.stroke),
  stripe: color(sources.good.elements.find(e => e.tag === "rect").style.fill),
  pupil: color(sources.good.elements.find(e => e.tag === "circle").style.fill),
  cheek: color(cheeks[0].style.fill),
  sleep: color(zs[0].style.stroke),
};
export const SOURCE_MANIFEST = {
  files: Object.fromEntries(Object.entries(sources).map(([name, s]) => [name, { sha256: s.hash, viewBox: s.viewBox }])),
  transforms,
  bodyWidth: BODY_WIDTH,
  rootX: ROOT_X,
  pausedBody: "good.svg (position held by product requirement)",
};
