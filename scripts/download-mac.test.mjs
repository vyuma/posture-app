import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../api/download-mac.js";

const release = (version) => ({ draft: false, prerelease: false, assets: [{
  name: `PiiiN_${version}_universal.dmg`, state: "uploaded",
  browser_download_url: `https://github.com/vyuma/posture-app/releases/download/v${version}/PiiiN_${version}_universal.dmg`,
}] });

test("download follows a new release without a web redeploy or cached redirect", async (t) => {
  let current = release("0.1.4");
  t.mock.method(globalThis, "fetch", async () => Response.json(current));
  for (const version of ["0.1.4", "0.2.0"]) {
    current = release(version);
    const response = await GET();
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), current.assets[0].browser_download_url);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("unavailable, incomplete, prerelease or unsafe releases never use an old installer", async (t) => {
  for (const payload of [
    { ...release("0.2.0"), assets: [] },
    { ...release("0.2.0"), prerelease: true },
    { ...release("0.2.0"), draft: true },
    { assets: [{ ...release("0.2.0").assets[0], browser_download_url: "https://example.com/installer.dmg" }] },
    null,
  ]) {
    t.mock.method(globalThis, "fetch", async () => payload ? Response.json(payload) : new Response(null, { status: 403 }));
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(await response.text(), /もう一度試す/);
    t.mock.restoreAll();
  }
});
