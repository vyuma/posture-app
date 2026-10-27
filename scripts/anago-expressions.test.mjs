import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { EXPRESSION_POSES as poses, EXPRESSION_SOURCES as sources } from "./anago-expression-source.mjs";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const animation = JSON.parse(read("public/animations/anago/normal-nago/expression-states.json"));
const value = (property, end = false) => property.a ? property.k.at(end ? -1 : 0).s[0] : property.k;

test("new state endpoints preserve the supplied SVGs and matching transition seams", () => {
  for (const name of ["rest", "angry"]) assert.equal(createHash("sha256").update(read(`public/characters/anago/normal-nago/expressions/${name}.svg`)).digest("hex"), sources.files[name].sha256);
  for (const [state, pose] of [["Good", poses.good], ["Bad", poses.angry], ["Paused", poses.rest]]) {
    const layer = animation.layers.find(l => l.nm === `State / ${state} / Body`);
    assert.deepEqual(value(layer.shapes[0].it[0].ks), pose.body);
    assert.deepEqual(layer.shapes[0].it[1].c.k, pose.bodyColor);
  }
  for (const [segment, from, to] of [
    ["Good to Bad", poses.good, poses.angry], ["Bad to Happy", poses.angry, poses.happy],
    ["Good to Paused", poses.good, poses.rest], ["Paused to Good", poses.rest, poses.good],
    ["Bad to Paused", poses.angry, poses.rest], ["Paused to Bad", poses.rest, poses.angry],
  ]) {
    const body = animation.layers.find(l => l.nm === `${segment} / Body`).shapes[0].it[0].ks;
    assert.deepEqual(value(body), from.body);
    assert.deepEqual(value(body, true), to.body);
  }
  assert.notDeepEqual(poses.rest.body, poses.good.body, "rest now bends the body, rather than only closing its eyes");
  assert.deepEqual(poses.angry.eyeRotations, [35.73, -35.73]);
});

test("all intermediate stripes remain convex and every property is finite", () => {
  let count = 0;
  function visit(v) {
    if (typeof v === "number") assert.ok(Number.isFinite(v));
    if (!v || typeof v !== "object") return;
    if (v.c && v.v?.length === 4) {
      count++;
      for (let i = 0; i < 4; i++) {
        const a = v.v[i], b = v.v[(i+1)%4], c = v.v[(i+2)%4];
        assert.ok((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) > 0);
      }
    }
    Object.values(v).forEach(visit);
  }
  visit(animation);
  assert.ok(count > 1000);
  assert.equal(animation.op, 408);
  assert.equal(new Set(animation.layers.map(l => l.ind)).size, animation.layers.length);
});

test("the runtime retains all six transition ranges and the new state asset", () => {
  const component = read("src/features/overlay/WebInlineCharacterOverlay.tsx");
  assert.ok(component.includes("/normal-nago/expression-states.json"));
  const ranges = [...component.matchAll(/"(good|bad|paused):(good|bad|paused)": \[(\d+), (\d+)\]/g)];
  assert.equal(ranges.length, 6);
  for (const [, from, to, start, end] of ranges) {
    const marker = animation.markers.find(m => m.cm === `${from}_to_${to}`);
    assert.deepEqual([Number(start), Number(end)], [marker.tm, marker.tm + marker.dr - 1]);
  }
});
