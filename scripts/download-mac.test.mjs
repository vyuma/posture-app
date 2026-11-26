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

test('API throttling resolves the public latest tag and verifies its installer with HEAD', async (t) => {
  let version = '0.1.9';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.startsWith('https://api.github.com/')) return new Response(null, { status: 403 });
    if (url.endsWith('/releases/latest')) return new Response(null, { status: 302, headers: { Location: `https://github.com/vyuma/posture-app/releases/tag/v${version}` } });
    assert.equal(options.method, 'HEAD');
    assert.equal(url, `https://github.com/vyuma/posture-app/releases/download/v${version}/PiiiN_${version}_universal.dmg`);
    return new Response(null, { status: 302, headers: { Location: 'https://release-assets.githubusercontent.com/verified-installer' } });
  });
  for (const next of ['0.1.9', '0.2.0']) {
    version = next;
    const response = await GET();
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), release(version).assets[0].browser_download_url);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('public fallback rejects unexpected tags, origins and missing installers', async (t) => {
  for (const [location, assetStatus] of [
    ['https://example.com/vyuma/posture-app/releases/tag/v1.0.0', 302],
    ['https://github.com/vyuma/posture-app/releases/tag/v1.0.0-beta', 302],
    ['https://github.com/vyuma/posture-app/releases/tag/v1.0.0', 404],
  ]) {
    t.mock.method(globalThis, 'fetch', async url => {
      if (url.startsWith('https://api.github.com/')) return new Response(null, { status: 403 });
      if (url.endsWith('/releases/latest')) return new Response(null, { status: 302, headers: { Location: location } });
      return new Response(null, { status: assetStatus });
    });
    assert.equal((await GET()).status, 503);
    t.mock.restoreAll();
  }
});
