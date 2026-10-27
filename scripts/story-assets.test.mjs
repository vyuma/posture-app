import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const grades = JSON.parse(read("src/features/characters/characterGrades.json"));
const cards = JSON.parse(read("src/features/onboarding/storyCards.json"));
const animation = JSON.parse(read("public/story/redesign/story-poses.json"));

test("all current catalog IDs have a one-star grade; five future tiers are defined", () => {
  const ids = [...read("src/features/characters/characterCatalog.ts").matchAll(/id: "([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(Object.keys(grades.characters).sort(), ids.sort());
  assert.deepEqual(grades.tiers.map(tier => tier.stars), [1, 2, 3, 4, 5]);
  assert.equal(new Set(grades.tiers.map(tier => tier.id)).size, 5);
  for (const stars of Object.values(grades.characters)) assert.equal(stars, 1);
  for (const card of cards) assert.ok(grades.characters[card.characterId]);
});

test("the story morph has finite geometry and no collapsed or twisted stripes", () => {
  assert.deepEqual(animation.assets, []);
  assert.equal(animation.fr, 30);
  assert.equal(animation.op, 62);
  let paths = 0;
  function visit(value) {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
    if (!value || typeof value !== "object") return;
    if (value.c === true && value.v?.length === 4) {
      paths++;
      const signs = value.v.map((a, i, points) => {
        const b = points[(i + 1) % 4], c = points[(i + 2) % 4];
        return Math.sign((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]));
      });
      assert.ok(signs.every(sign => sign === 1), "stripe must remain a convex clockwise quadrilateral");
    }
    Object.values(value).forEach(visit);
  }
  visit(animation);
  assert.ok(paths > 100, "validate intermediate poses, not only endpoints");
});

test("mirrored intro eyes stay separated throughout the happy transition", () => {
  const eyes = animation.layers.find(layer => layer.nm.endsWith(" / Eyes"));
  const [left, right] = eyes.shapes.map(group => group.it.find(shape => shape.ty === "el").p.k);
  assert.equal(left.length, right.length);
  left.forEach((frame, i) => assert.ok(right[i].s[0] - frame.s[0] > 40, "eyes must not cross"));
});

test("every story pose keeps a straight stem beyond tall portrait windows", () => {
  assert.equal(animation.h, 4000);
  for (const layer of animation.layers.filter(layer => layer.nm.endsWith(" / Body"))) {
    const frames = layer.shapes[0].it.find(shape => shape.ty === "sh").ks.k;
    for (const frame of frames) {
      if (!frame.s) continue;
      const body = frame.s[0];
      assert.equal(body.v[0][1], 4000);
      assert.equal(body.v[0][0], body.v[1][0]);
      assert.equal(body.o[0][0], 0);
      assert.equal(body.i[1][0], 0);
      assert.ok(body.v[1][1] > 1600, "extension must join below the original viewport");
    }
  }
  const fallback = read("public/story/redesign/intro-story.svg");
  assert.ok(fallback.includes('viewBox="0 0 1512 4000"'));
  assert.ok(!fallback.includes("<image"), "loading fallback must not use a cropped raster portrait");
});
