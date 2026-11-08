const RELEASES = "https://github.com/vyuma/posture-app/releases/latest";

export async function GET() {
  // Never cache a version-specific redirect in the browser or CDN.
  const headers = { "Cache-Control": "no-store" };
  try {
    const response = await fetch(
      "https://api.github.com/repos/vyuma/posture-app/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "PiiiN-download" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error(`GitHub status ${response.status}`);
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
  } catch {
    // A rate limit or incomplete release must not silently download an old build.
    return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PiiiNをダウンロード</title><body><main><h1>ダウンロードを準備できませんでした</h1><p>しばらく待ってから、もう一度お試しください。</p><p><a href="/api/download-mac">もう一度試す</a></p><p><a href="${RELEASES}">最新リリースを確認する</a></p><p><a href="/">ホームに戻る</a></p></main></body></html>`, {
      status: 503,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Retry-After": "60" },
    });
  }
}
