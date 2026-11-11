import { pathToFileURL } from 'node:url';

// Deliberately does not follow OAuth redirects or print URLs containing state/codes.
export async function checkDeployment(origin, { auth = false, apple = false, developer = false, fetcher = fetch, log = console.log } = {}) {
  const url = new URL(origin);
  if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)) throw new Error('Pass an origin without a path or trailing slash.');
  const request = (path, options = {}) => fetcher(origin + path, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const requireResult = (condition, message) => { if (!condition) throw new Error(message); };
  for (const path of ['/', '/app', '/privacy', '/support', '/login', '/signup', '/forgot-password', '/reset-password', '/dev/login', '/account/native']) {
    const response = await request(path);
    requireResult(response.status === 200 && response.headers.get('Content-Type')?.includes('text/html'), `${path}: expected the HTML application, got ${response.status}`);
    const html = await response.text();
    requireResult(/<div[^>]+id=["']root["']/.test(html), `${path}: application root is missing`);
    log(`OK ${path}`);
  }
  const download = await request('/api/download-mac');
  const location = download.headers.get('Location');
  requireResult(download.status === 302 && location?.startsWith('https://github.com/vyuma/posture-app/releases/download/'), `Mac download: expected the current release redirect, got ${download.status}`);
  log('OK Mac download redirect');
  const me = await request('/api/me');
  requireResult(me.status === (auth ? 200 : 503), `/api/me: expected ${auth ? 'configured authentication' : 'authentication not enabled'}, got ${me.status}`);
  if (auth) {
    const session = await me.json();
    requireResult(session.user === null && session.consent === null, 'Anonymous request unexpectedly received an identity.');
    for (const provider of apple ? ['google', 'apple'] : ['google']) {
      const response = await request('/api/auth/sign-in/social', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, callbackURL: `${origin}/app`, disableRedirect: true }) });
      requireResult(response.status === 200, `${provider}: authorization start failed (${response.status})`);
      const body = await response.json();
      const redirect = new URL(body.url);
      requireResult(redirect.origin === (provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com'), `${provider}: unexpected authorization destination`);
      requireResult(redirect.searchParams.get('redirect_uri') === `${origin}/api/auth/callback/${provider}`, `${provider}: callback origin mismatch`);
      requireResult(!!redirect.searchParams.get('client_id') && !!redirect.searchParams.get('state'), `${provider}: missing OAuth client/state`);
      log(`OK ${provider} authorization start and callback origin (provider login still requires a browser)`);
    }
  }
  const dev = await request('/api/dev-session');
  requireResult(dev.status === 200, `Developer session: unexpected status ${dev.status}`);
  const devSession = await dev.json();
  requireResult(devSession.authenticated === false && devSession.configured === developer, 'Developer login configuration does not match the deployment.');
  log('OK developer session configuration');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkDeployment(process.argv[2], { auth: process.env.PIIIN_AUTH_ENABLED === 'true', apple: process.env.PIIIN_APPLE_ENABLED === 'true', developer: process.env.PIIIN_DEVELOPER_ENABLED === 'true' });
  } catch (error) {
    // The body may contain a provider URL. Never print responses, cookies or credentials.
    console.error(error.message);
    process.exitCode = 1;
  }
}
