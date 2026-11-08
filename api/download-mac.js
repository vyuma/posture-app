const RELEASES = "https://github.com/vyuma/posture-app/releases/latest";

// Shared hosting egress can exhaust GitHub's anonymous API quota. Resolve the
// same public latest release, then check its exact installer without downloading it.
async function publicLatestInstaller() {
  const latest = await fetch(RELEASES, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const target = latest.headers.get('Location');
  if (![301, 302, 303, 307, 308].includes(latest.status) || !target) return null;
  const url = new URL(target, RELEASES);
  const match = url.pathname.match(/^\/vyuma\/posture-app\/releases\/tag\/(v?(\d+\.\d+\.\d+))$/);
  if (url.origin !== 'https://github.com' || !match || url.search || url.hash) return null;
  const installer = `https://github.com/vyuma/posture-app/releases/download/${match[1]}/PiiiN_${match[2]}_universal.dmg`;
  const asset = await fetch(installer, { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const assetTarget = asset.headers.get('Location');
  if (asset.status === 302 && assetTarget) {
    const signed = new URL(assetTarget);
    if (signed.protocol === 'https:' && signed.hostname === 'release-assets.githubusercontent.com') return installer;
  }
  if (asset.status === 200 && /^(application\/octet-stream|application\/x-apple-diskimage)(;|$)/.test(asset.headers.get('Content-Type') ?? '')) return installer;
  return null;
}

export async function GET() {
  // Never cache a version-specific redirect in the browser or CDN.
  const headers = { "Cache-Control": "no-store" };
  let failure = 'fetch';
  try {
    const response = await fetch(
      "https://api.github.com/repos/vyuma/posture-app/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "PiiiN-download" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      failure = `github-${response.status}`;
      if ([403, 429, 500, 502, 503, 504].includes(response.status)) {
        const installer = await publicLatestInstaller();
        if (installer) return new Response(null, { status: 302, headers: { ...headers, Location: installer } });
      }
      throw new Error(`GitHub status ${response.status}`);
    }
    failure = 'release-data';
    const release = await response.json();
    const asset = !release.draft && !release.prerelease && release.assets?.find(
      (item) => /^PiiiN_.+_universal\.dmg$/.test(item.name) && item.state === "uploaded",
    );
    const url = asset && new URL(asset.browser_download_url);
    if (!url || url.origin !== "https://github.com" ||
        !url.pathname.startsWith("/vyuma/posture-app/releases/download/")) {
      throw new Error("Latest release has no universal DMG");
    }
    return new Response(null, { status: 302, headers: { ...headers, Location: url.href } });
  } catch (error) {
    // This lookup contains only a public release URL. Keep its failure diagnosable
    // across deployment runtimes without logging request headers or response bodies.
    console.warn('Mac release lookup failed', error instanceof Error ? error.message : 'UnknownError');
    // A rate limit or incomplete release must not silently download an old build.
    return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PiiiNをダウンロード</title><body><main><h1>ダウンロードを準備できませんでした</h1><p>しばらく待ってから、もう一度お試しください。</p><p><a href="/api/download-mac">もう一度試す</a></p><p><a href="${RELEASES}">最新リリースを確認する</a></p><p><a href="/">ホームに戻る</a></p></main></body></html>`, {
      status: 503,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Retry-After": "60", "X-Piiin-Download-Error": failure },
    });
  }
}
