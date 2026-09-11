/* global console */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COLORS, HEIGHT, POSES, SOURCE_MANIFEST, WIDTH, path, transformPath } from "./anago-svg-source.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  projectRoot,
  "public/animations/anago/normal-nago/overlay.json",
);

const FPS = 30;
const EASE = {
  enter: { x1: 0.2, y1: 0.75, x2: 0.34, y2: 0.94 },
  state: { x1: 0.65, y1: 0, x2: 0.35, y2: 1 },
  settle: { x1: 0, y1: 0.65, x2: 0.51, y2: 0.99 },
  exit: { x1: 1, y1: 0.02, x2: 0.54, y2: 0.42 },
  sampled: { x1: 0, y1: 0, x2: 1, y2: 1 },
};

function interpolateValue(from, to, amount) {
  if (typeof from === "number" && typeof to === "number") {
    return from + (to - from) * amount;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((value, index) =>
      interpolateValue(value, to[index], amount),
    );
  }
  if (from && to && typeof from === "object" && typeof to === "object") {
    return Object.fromEntries(
      Object.keys(from).map((key) => [
        key,
        interpolateValue(from[key], to[key], amount),
      ]),
    );
  }
  return amount < 0.5 ? from : to;
}

const smooth = (t) => {
  const p = Math.max(0, Math.min(1, t));
  return p * p * (3 - 2 * p);
};
const ramp = (t, start, end) => smooth((t - start) / (end - start));
const pulse = (t, start, peak, end) =>
  t <= peak ? ramp(t, start, peak) : 1 - ramp(t, peak, end);

// Evaluate the existing cubic spine. Bands are attached to it, so they turn
// with the body instead of shrinking or sliding through its silhouette.
function spineAt(body, u) {
  const index = Math.min(body.v.length - 2, Math.floor(u));
  const t = u - index;
  const a = body.v[index];
  const b = a.map((v, axis) => v + body.o[index][axis]);
  const d = body.v[index + 1];
  const c = d.map((v, axis) => v + body.i[index + 1][axis]);
  const point = a.map((v, axis) =>
    (1 - t) ** 3 * v + 3 * (1 - t) ** 2 * t * b[axis] +
    3 * (1 - t) * t * t * c[axis] + t ** 3 * d[axis],
  );
  const derivative = a.map((v, axis) =>
    3 * (1 - t) ** 2 * (b[axis] - v) +
    6 * (1 - t) * t * (c[axis] - b[axis]) +
    3 * t * t * (d[axis] - c[axis]),
  );
  const length = Math.hypot(...derivative) || 1;
  const tangent = derivative.map((v) => v / length);
  return { point, tangent, normal: [-tangent[1], tangent[0]] };
}

function spineSamples(body) {
  const samples = [];
  let distance = 0;
  for (let step = 400; step >= 0; step--) {
    const u = step / 100;
    const point = spineAt(body, u).point;
    if (samples.length) {
      const previous = samples.at(-1).point;
      distance += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    }
    samples.push({ u, point, distance });
  }
  return samples;
}

function spineDistanceAt(body, samples, distance) {
  const index = samples.findIndex(sample => sample.distance >= distance);
  if (index <= 0) return spineAt(body, index === 0 ? 4 : 0);
  const a = samples[index - 1], b = samples[index];
  const t = (distance - a.distance) / (b.distance - a.distance);
  return spineAt(body, a.u + (b.u - a.u) * t);
}

function bandFrameAt(body, samples, distance, bandIndex, bodyWidth) {
  const frame = spineDistanceAt(body, samples, distance);
  if (bandIndex !== 1) return frame;

  // The second band crosses the straight/curved spine join. A point tangent
  // jumps there (and can be zero at the SVG's repeated control point).
  // Orient this band from a body-width-relative neighbourhood instead.
  const span = bodyWidth / 4;
  const below = spineDistanceAt(body, samples, distance + span).point;
  const above = spineDistanceAt(body, samples, distance - span).point;
  const delta = above.map((v, axis) => v - below[axis]);
  const length = Math.hypot(...delta);
  if (length < 1e-8) return frame;
  const tangent = delta.map(v => v / length);
  return { point: frame.point, tangent, normal: [-tangent[1], tangent[0]] };
}

function bindBand(pose, band, bandIndex) {
  const center = [0, 1].map((axis) =>
    band.path.v.reduce((sum, p) => sum + p[axis], 0) / band.path.v.length,
  );
  let closest;
  let distance = Infinity;
  const samples = spineSamples(pose.body);
  for (const sample of samples) {
    const { point } = sample;
    const next = Math.hypot(point[0] - center[0], point[1] - center[1]);
    if (next < distance) { distance = next; closest = sample; }
  }
  const { point, tangent, normal } = bandFrameAt(pose.body, samples, closest.distance, bandIndex, pose.bodyWidth);
  return {
    distance: closest.distance,
    vertices: band.path.v.map((p) => {
      const delta = p.map((v, axis) => v - point[axis]);
      return [
        delta[0] * tangent[0] + delta[1] * tangent[1],
        delta[0] * normal[0] + delta[1] * normal[1],
      ];
    }),
  };
}

const bandBindings = new Map(Object.values(POSES).map((pose) =>
  [pose, pose.stripes.map((band, index) => bindBand(pose, band, index))],
));

function bendPose(from, to, t, recovering, relaxing = false) {
  const start = recovering ? 0.18 : 0.16;
  const finish = recovering ? 0.73 : 0.83;
  const headProgress = ramp(t, start, finish);
  const pose = interpolateValue(from, to, headProgress);
  const anticipate = pulse(t, 0, 0.16, 0.36);
  const settle = pulse(t, finish - 0.13, finish, 1);
  const strength = relaxing ? 0.3 : 1;
  const dx = ((recovering ? -9 : -14) * anticipate + (recovering ? -9 : 9) * settle) * strength;
  const dy = ((recovering ? 24 : -13) * anticipate + (recovering ? -22 : 12) * settle) * strength;

  // Head initiates the action; the lower body catches up a few frames later.
  for (let i = 0; i < pose.body.v.length; i++) {
    const weight = i / (pose.body.v.length - 1);
    const delay = (1 - weight) * 0.085;
    const progress = ramp(t, start + delay, finish + delay);
    for (const key of ["v", "i", "o"]) {
      pose.body[key][i] = interpolateValue(from.body[key][i], to.body[key][i], progress);
    }
    pose.body.v[i][0] += dx * weight ** 2;
    pose.body.v[i][1] += dy * weight ** 2;
  }

  const samples = spineSamples(pose.body);
  pose.stripes = pose.stripes.map((band, index) => {
    const a = bandBindings.get(from)[index];
    const b = bandBindings.get(to)[index];
    // Preserve spacing along the spine, not Bezier parameter values: curves
    // have different segment lengths, so parameter lerp bunches bands up.
    const distance = a.distance + (b.distance - a.distance) * headProgress;
    const { point, tangent, normal } = bandFrameAt(pose.body, samples, distance, index, pose.bodyWidth);
    const local = interpolateValue(a.vertices, b.vertices, headProgress);
    return { ...band, path: path(local.map(([along, across]) => [
      point[0] + tangent[0] * along + normal[0] * across,
      point[1] + tangent[1] * along + normal[1] * across,
    ]), undefined, undefined, true) };
  });

  // Keep the face attached to the head while the spine follows through.
  for (const key of ["eyes", "cheeks"]) {
    pose[key] = pose[key].map(([x, y]) => [x + dx, y + dy]);
  }
  pose.closedEyes = pose.closedEyes.map(shape => transformPath(shape, 1, [dx, dy]));
  return pose;
}

function setLids(pose, openness) {
  // A blink closes the eye vertically. Opacity only switches at the final
  // narrow slit, avoiding two translucent expressions on top of one another.
  pose.eyeSize[1] *= Math.max(0.045, openness);
  pose.openEyesOpacity = 100 * ramp(openness, 0.025, 0.12);
  pose.closedEyesOpacity = 100 - pose.openEyesOpacity;
}

function actingPose(from, to, t, marker) {
  if (t === 0) return from;
  if (t === 1) return to;
  const fallingAsleep = marker.endsWith("to_paused");
  const waking = marker.startsWith("paused_to");
  const expressionOnly = marker === "good_to_paused" || marker === "paused_to_good";
  const recovering = marker === "bad_to_happy" || marker === "bad_to_paused";
  const pose = expressionOnly
    ? interpolateValue(from, to, ramp(t, 0.15, 0.6))
    : bendPose(from, to, t, recovering, marker === "happy_to_good");

  let openness;
  if (fallingAsleep) {
    const delay = expressionOnly ? 0 : 0.24;
    openness = 1 - ramp(t, 0.1 + delay, 0.49 + delay);
    pose.zOpacity = 100 * ramp(t, 0.6, 0.96);
  } else if (waking) {
    openness = ramp(t, 0.08, 0.36) * (1 - 0.92 * pulse(t, 0.45, 0.53, 0.65));
    pose.zOpacity = 100 * (1 - ramp(t, 0, 0.28));
  } else {
    openness = 1 - 0.96 * pulse(t, 0.025, 0.105, 0.205);
    pose.zOpacity = 0;
  }
  setLids(pose, openness);
  if (marker === "bad_to_happy") {
    pose.cheekOpacity = to.cheekOpacity * ramp(t, 0.38, 0.85);
  }
  return pose;
}

function actingSegment(name, marker, start, end, from, to) {
  const times = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  return {
    name, marker, start, end, times,
    poses: times.map((frame) => actingPose(POSES[from], POSES[to], (frame - start) / (end - start), marker)),
    // Motion curves are already sampled above; interpolate between samples.
    eases: times.slice(1).map(() => EASE.sampled),
  };
}

const SEGMENTS = [
  { name: "State / Good", marker: "state_good", start: 0, end: 0, poses: [POSES.good] },
  { name: "State / Bad", marker: "state_bad", start: 1, end: 1, poses: [POSES.bad] },
  { name: "State / Paused", marker: "state_paused", start: 2, end: 2, poses: [POSES.paused] },
  { name: "Enter / Good", marker: "enter_good", start: 3, end: 32, poses: [POSES.good], motion: "enter" },
  { name: "Enter / Bad", marker: "enter_bad", start: 33, end: 62, poses: [POSES.bad], motion: "enter" },
  { name: "Enter / Paused", marker: "enter_paused", start: 63, end: 92, poses: [POSES.paused], motion: "enter" },
  { name: "Exit / Good", marker: "exit_good", start: 93, end: 122, poses: [POSES.good], motion: "exit" },
  { name: "Exit / Bad", marker: "exit_bad", start: 123, end: 152, poses: [POSES.bad], motion: "exit" },
  { name: "Exit / Paused", marker: "exit_paused", start: 153, end: 182, poses: [POSES.paused], motion: "exit" },
  actingSegment("Good to Bad", "good_to_bad", 183, 212, "good", "bad"),
  actingSegment("Bad to Happy", "bad_to_happy", 213, 242, "bad", "happy"),
  { name: "Hold / Happy", marker: "hold_happy", start: 243, end: 260, poses: [POSES.happy] },
  actingSegment("Happy to Good", "happy_to_good", 261, 287, "happy", "good"),
  actingSegment("Good to Paused", "good_to_paused", 288, 317, "good", "paused"),
  actingSegment("Paused to Good", "paused_to_good", 318, 347, "paused", "good"),
  actingSegment("Bad to Paused", "bad_to_paused", 348, 377, "bad", "paused"),
  actingSegment("Paused to Bad", "paused_to_bad", 378, 407, "paused", "bad"),
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (values) => values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]));

// Catch identity/morph regressions before replacing the playable asset.
for (const segment of SEGMENTS) {
  for (const pose of segment.poses) {
    for (const band of pose.stripes) {
      const v = band.path.v;
      for (let i = 0; i < 4; i++) {
        const a = v[i], b = v[(i + 1) % 4], c = v[(i + 2) % 4];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (!(cross > 0)) throw new Error(`${segment.name}: a designer band twisted or collapsed`);
      }
    }
  }
  // At 30 fps a 5-degree step is already conspicuous for this small stripe.
  // In particular, guard both directions across the spine's straight join.
  const bandAngles = segment.poses.map(pose => {
    const [a, b] = pose.stripes[1].path.v;
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  });
  bandAngles.slice(1).forEach((angle, index) => {
    const delta = angle - bandAngles[index];
    const degrees = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) * 180 / Math.PI;
    if (degrees > 5) throw new Error(`${segment.name}: second band turns too abruptly (${degrees.toFixed(2)} degrees/frame)`);
  });
  if (["good_to_paused", "paused_to_good"].includes(segment.marker)) {
    for (const key of ["body", "stripes"]) {
      if (!same(segment.poses.map(pose => pose[key]))) throw new Error(`${segment.name}: ${key} must stay still`);
    }
  }
}

const dimensionsOf = (value) => (Array.isArray(value) ? value.length : 1);
const repeats = (value, count) => Array.from({ length: count }, () => value);

function property(values, times, eases = [], { shape: isShape = false } = {}) {
  if (same(values)) {
    return { a: 0, k: clone(values[0]) };
  }

  return {
    a: 1,
    k: values.map((value, index) => {
      const dimensions = isShape ? 1 : dimensionsOf(value);
      const keyframe = {
        t: times[index],
        s: isShape ? [clone(value)] : Array.isArray(value) ? clone(value) : [value],
      };

      if (index < values.length - 1) {
        const ease = eases[index] ?? EASE.state;
        const nextValue = values[index + 1];
        keyframe.e = isShape
          ? [clone(nextValue)]
          : Array.isArray(nextValue)
            ? clone(nextValue)
            : [nextValue];
        keyframe.o = {
          x: repeats(ease.x1, dimensions),
          y: repeats(ease.y1, dimensions),
        };
        keyframe.i = {
          x: repeats(ease.x2, dimensions),
          y: repeats(ease.y2, dimensions),
        };
      }

      return keyframe;
    }),
  };
}

const staticProperty = (value) => ({ a: 0, k: clone(value) });

const groupTransform = (opacity = staticProperty(100)) => ({
  ty: "tr",
  p: staticProperty([0, 0]),
  a: staticProperty([0, 0]),
  s: staticProperty([100, 100]),
  r: staticProperty(0),
  o: opacity,
  sk: staticProperty(0),
  sa: staticProperty(0),
  nm: "Transform",
});

const fill = (color, name) => ({
  ty: "fl",
  c: staticProperty(color),
  o: staticProperty(100),
  r: 1,
  bm: 0,
  nm: name,
});

const stroke = (color, width, name) => ({
  ty: "st",
  c: staticProperty(color),
  o: staticProperty(100),
  w: typeof width === "number" ? staticProperty(width) : width,
  lc: 2,
  lj: 2,
  ml: 4,
  bm: 0,
  nm: name,
});

function timesFor(segment) {
  if (segment.times) return segment.times;
  if (segment.poses.length === 1) return [segment.start];
  if (segment.poses.length === 3) return [segment.start, segment.beat, segment.end];
  return [segment.start, segment.end];
}

function easesFor(segment) {
  if (segment.eases) return segment.eases;
  if (segment.poses.length === 3) return [EASE.enter, EASE.settle];
  return [EASE.state];
}

function layerMotion(segment) {
  if (segment.motion === "enter") {
    const settle = segment.start + 20;
    return {
      p: property(
        [[0, 210, 0], [0, -12, 0], [0, 0, 0]],
        [segment.start, settle, segment.end],
        [EASE.enter, EASE.settle],
      ),
      o: property([0, 100, 100], [segment.start, segment.start + 10, segment.end], [EASE.enter, EASE.settle]),
    };
  }

  if (segment.motion === "exit") {
    return {
      p: property(
        [[0, 0, 0], [0, 18, 0], [0, 240, 0]],
        [segment.start, segment.start + 8, segment.end],
        [EASE.settle, EASE.exit],
      ),
      o: property([100, 100, 0], [segment.start, segment.start + 8, segment.end], [EASE.settle, EASE.exit]),
    };
  }

  return { p: staticProperty([0, 0, 0]), o: staticProperty(100) };
}

function layer(name, shapes, segment, index) {
  const motion = layerMotion(segment);
  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: `${segment.name} / ${name}`,
    sr: 1,
    ks: {
      o: motion.o,
      r: staticProperty(0),
      p: motion.p,
      a: staticProperty([0, 0, 0]),
      s: staticProperty([100, 100, 100]),
    },
    ao: 0,
    shapes,
    ip: segment.start,
    op: segment.end + 1,
    st: 0,
    bm: 0,
  };
}

function pathGroup(name, pathProperty, style, opacityProperty = staticProperty(100)) {
  return {
    ty: "gr",
    nm: name,
    it: [
      { ty: "sh", ks: pathProperty, nm: `${name} Path` },
      style,
      groupTransform(opacityProperty),
    ],
  };
}

function ellipseGroup(name, positions, sizes, opacity, times, eases, color, outline) {
  return {
    ty: "gr",
    nm: name,
    it: [
      {
        ty: "el",
        d: 1,
        p: property(positions, times, eases),
        s: property(sizes, times, eases),
        nm: `${name} Ellipse`,
      },
      ...(outline ? [stroke(COLORS.stripe, property(outline, times, eases), `${name} Outline`)] : []),
      fill(color, `${name} Fill`),
      groupTransform(property(opacity, times, eases)),
    ],
  };
}

function sleepZValues(segment, poses, times, zIndex) {
  return times.map((frame, index) => {
    const shape = clone(poses[index].zs[zIndex]);
    const t = (frame - segment.start) / Math.max(1, segment.end - segment.start);
    let opacity = poses[index].zOpacity;
    let dx = 0;
    let dy = 0;
    if (segment.marker.endsWith("to_paused")) {
      const start = 0.54 + (2 - zIndex) * 0.095;
      const amount = ramp(t, start, start + 0.24);
      opacity = amount * 100;
      dx = 7 * (1 - amount);
      dy = 16 * (1 - amount);
    } else if (segment.marker.startsWith("paused_to")) {
      const amount = ramp(t, zIndex * 0.035, 0.24 + zIndex * 0.035);
      opacity = 100 * (1 - amount);
      dx = -5 * amount;
      dy = -16 * amount;
    }
    shape.v = shape.v.map(([x, y]) => [x + dx, y + dy]);
    return { shape, opacity };
  });
}

function makeSegmentLayers(segment, nextIndex) {
  const times = timesFor(segment);
  const eases = easesFor(segment);
  const poses = segment.poses;
  const layers = [];

  const zGroups = [0, 1, 2].map((zIndex) => {
    const values = sleepZValues(segment, poses, times, zIndex);
    return pathGroup(
      `Sleep Z ${zIndex + 1}`,
      property(values.map((value) => value.shape), times, eases, { shape: true }),
      stroke(COLORS.sleep, poses[0].zStroke, `Sleep Z ${zIndex + 1} Stroke`),
      property(values.map((value) => value.opacity), times, eases),
    );
  });
  layers.push(layer("Sleep Zs", zGroups, segment, nextIndex()));

  const cheekGroups = [0, 1].map((cheekIndex) =>
    ellipseGroup(
      `Cheek ${cheekIndex + 1}`,
      poses.map((pose) => pose.cheeks[cheekIndex]),
      poses.map(pose => pose.cheekSize),
      poses.map((pose) => pose.cheekOpacity),
      times,
      eases,
      COLORS.cheek,
    ),
  );
  layers.push(layer("Cheeks", cheekGroups, segment, nextIndex()));
  layers.at(-1).bm = 1;

  const eyeGroups = [0, 1].map((eyeIndex) =>
    ellipseGroup(
      `Eye ${eyeIndex + 1}`,
      poses.map((pose) => pose.eyes[eyeIndex]),
      poses.map((pose) => pose.eyeSize),
      poses.map((pose) => pose.openEyesOpacity),
      times,
      eases,
      COLORS.pupil,
      poses.map(pose => pose.eyeStroke),
    ),
  );
  layers.push(layer("Eyes", eyeGroups, segment, nextIndex()));

  const closedEyeGroups = [0, 1].map((eyeIndex) =>
    pathGroup(
      `Closed Eye ${eyeIndex + 1}`,
      property(poses.map((pose) => pose.closedEyes[eyeIndex]), times, eases, { shape: true }),
      stroke(COLORS.stripe, poses[0].closedEyeStroke, `Closed Eye ${eyeIndex + 1} Stroke`),
      property(poses.map((pose) => pose.closedEyesOpacity), times, eases),
    ),
  );
  layers.push(layer("Closed Eyes", closedEyeGroups, segment, nextIndex()));

  const stripeGroups = poses[0].stripes.map((_, stripeIndex) =>
    pathGroup(
      `Stripe ${stripeIndex + 1}`,
      property(poses.map((pose) => pose.stripes[stripeIndex].path), times, eases, { shape: true }),
      fill(COLORS.stripe, `Stripe ${stripeIndex + 1} Fill`),
      property(poses.map((pose) => pose.stripes[stripeIndex].opacity), times, eases),
    ),
  );
  layers.push(layer("Stripes", stripeGroups, segment, nextIndex()));

  const bodyGroup = pathGroup(
    "Body",
    property(poses.map((pose) => pose.body), times, eases, { shape: true }),
    stroke(
      COLORS.body,
      property(poses.map((pose) => pose.bodyWidth), times, eases),
      "Body Stroke",
    ),
  );
  layers.push(layer("Body", [bodyGroup], segment, nextIndex()));

  if (segment.times && bodyGroup.it[0].ks.a === 1) {
    const matte = layer("Band silhouette", [clone(bodyGroup)], segment, nextIndex());
    matte.td = 1;
    layers[layers.length - 2].tt = 1;
    layers.splice(layers.length - 2, 0, matte);
  }

  return layers;
}

let layerIndex = 1;
const nextLayerIndex = () => layerIndex++;
const layers = SEGMENTS.flatMap((segment) =>
  makeSegmentLayers(segment, nextLayerIndex),
);

const animation = {
  v: "5.13.0",
  fr: FPS,
  ip: 0,
  op: 408,
  w: WIDTH,
  h: HEIGHT,
  nm: "PiiiN Normal Nago Vector State Rig",
  ddd: 0,
  assets: [],
  layers,
  markers: [...SEGMENTS.map((segment) => ({
    tm: segment.start,
    cm: segment.marker,
    dr: segment.end - segment.start + 1,
  })), { tm: 213, cm: "bad_to_good", dr: 75 }],
};

function validateWebKeyframes(value, location = "animation") {
  if (!value || typeof value !== "object") return;

  if (
    value.a === 1 &&
    Array.isArray(value.k) &&
    value.k.every(
      (keyframe) =>
        keyframe && typeof keyframe === "object" && "t" in keyframe,
    )
  ) {
    value.k.slice(0, -1).forEach((keyframe, index) => {
      if (!keyframe.i || !keyframe.o) {
        throw new Error(
          `${location}.k[${index}] must include both i and o easing handles for lottie-web`,
        );
      }
    });
  }

  Object.entries(value).forEach(([key, child]) => {
    validateWebKeyframes(child, `${location}.${key}`);
  });
}

validateWebKeyframes(animation);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(animation)}\n`);
writeFileSync(resolve(dirname(outputPath), "source-manifest.json"), `${JSON.stringify(SOURCE_MANIFEST, null, 2)}\n`);

console.log(
  `Wrote ${outputPath} (${animation.layers.length} layers, ${animation.op} frames)`,
);
