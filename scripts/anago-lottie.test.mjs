/* global URL */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { POSES, SOURCE_MANIFEST } from "./anago-svg-source.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const animation = JSON.parse(read("public/animations/anago/normal-nago/overlay.json"));
const generatedManifest = JSON.parse(read("public/animations/anago/normal-nago/source-manifest.json"));
const marker = name => animation.markers.find(m => m.cm === name);
const layer = (segment, name) => animation.layers.find(l => l.nm === `${segment} / ${name}`);
const value = (p, end = false, shape = false) => {
  if (!p.a) return p.k;
  const s = p.k.at(end ? -1 : 0).s;
  return shape ? s[0] : s;
};

function assertPose(segment, expected, end = false) {
  assert.deepEqual(value(layer(segment, "Body").shapes[0].it[0].ks, end, true), expected.body);
  layer(segment, "Stripes").shapes.forEach((group, i) => {
    assert.deepEqual(value(group.it[0].ks, end, true), expected.stripes[i].path);
    assert.equal(Number(value(group.it.at(-1).o, end)), expected.stripes[i].opacity);
  });
  layer(segment, "Eyes").shapes.forEach((group, i) => {
    assert.deepEqual(value(group.it[0].p, end), expected.eyes[i]);
    assert.deepEqual(value(group.it[0].s, end), expected.eyeSize);
    assert.equal(Number(value(group.it.find(s => s.ty === "st").w, end)), expected.eyeStroke);
  });
  layer(segment, "Cheeks").shapes.forEach((group, i) => {
    assert.deepEqual(value(group.it[0].p, end), expected.cheeks[i]);
    assert.deepEqual(value(group.it[0].s, end), expected.cheekSize);
    assert.equal(Number(value(group.it.at(-1).o, end)), expected.cheekOpacity);
  });
}

test("recovery has contiguous bad -> happy hold -> good beats", () => {
  const up = marker("bad_to_happy"), hold = marker("hold_happy"), rest = marker("happy_to_good");
  assert.equal(up.tm + up.dr, hold.tm);
  assert.equal(hold.tm + hold.dr, rest.tm);
  assert.equal(hold.dr / animation.fr, 0.6);
  assert.deepEqual(marker("bad_to_good"), { tm: up.tm, cm: "bad_to_good", dr: up.dr + hold.dr + rest.dr });
  assertPose("Bad to Happy", POSES.bad);
  assertPose("Bad to Happy", POSES.happy, true);
  assertPose("Hold / Happy", POSES.happy);
  for (const l of animation.layers.filter(l => l.nm.startsWith("Hold / Happy /"))) {
    assert.ok(!JSON.stringify(l.shapes).includes('"a":1'), "happy must remain still during its hold");
  }
  assertPose("Happy to Good", POSES.happy);
  assertPose("Happy to Good", POSES.good, true);
});

test("web playback ranges match the generated markers", () => {
  const component = read("src/features/overlay/WebInlineCharacterOverlay.tsx");
  for (const match of component.matchAll(/"(good|bad|paused):(good|bad|paused)": \[(\d+), (\d+)\]/g)) {
    const m = marker(`${match[1]}_to_${match[2]}`);
    assert.ok(m, match[0]);
    assert.deepEqual([Number(match[3]), Number(match[4])], [m.tm, m.tm + m.dr - 1]);
  }
  assert.equal(animation.op, Math.max(...animation.layers.map(l => l.op)));
});

test("generated manifest matches SVG sources; sleeping body remains stationary", () => {
  assert.deepEqual(generatedManifest, SOURCE_MANIFEST);
  for (const [name, source] of Object.entries(generatedManifest.files)) {
    const hash = createHash("sha256").update(read(`public/characters/anago/normal-nago/expressions/${name}.svg`)).digest("hex");
    assert.equal(hash, source.sha256);
  }
  assert.deepEqual(POSES.paused.body, POSES.good.body);
  assert.deepEqual(POSES.paused.stripes, POSES.good.stripes);
  for (const segment of ["Good to Paused", "Paused to Good"]) {
    for (const name of ["Body", "Stripes"]) {
      assert.ok(!JSON.stringify(layer(segment, name).shapes).includes('"a":1'));
    }
  }
});
