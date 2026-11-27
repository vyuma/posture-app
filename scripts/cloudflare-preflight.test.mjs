import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeployment } from './cloudflare-preflight.mjs';

const preview = {
  CLOUDFLARE_API_TOKEN: 'never-print-this-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  PIIIN_D1_ID: '12345678-abcd-1234-abcd-123456789abc', PIIIN_PRODUCTION_D1_ID: '87654321-abcd-1234-abcd-123456789abc', WORKERS_SUBDOMAIN: 'example',
  PIIIN_WORKER_NAME: 'piiin-pr-35', PIIIN_APP_ORIGIN: 'https://piiin-pr-35.example.workers.dev',
};
const authFlags = { PIIIN_AUTH_ENABLED: 'true', PIIIN_APPLE_ENABLED: 'true', PIIIN_DEVELOPER_ENABLED: 'true', PIIIN_EMAIL_ENABLED: 'true' };
const staging = { ...preview, ...authFlags, PIIIN_WORKER_NAME: 'piiin-staging', PIIIN_APP_ORIGIN: 'https://piiin-staging.example.workers.dev' };
const production = { ...preview, ...authFlags, PIIIN_WORKER_NAME: 'piiin', PIIIN_APP_ORIGIN: 'https://www.piiin.app', PIIIN_D1_ID: preview.PIIIN_PRODUCTION_D1_ID, PIIIN_DOMAIN_ENABLED: 'true' };
test('reports the missing workers subdomain before calling Cloudflare', () => {
  assert.throws(() => validateDeployment({ ...preview, WORKERS_SUBDOMAIN: '' }, 'preview'), /WORKERS_SUBDOMAIN/);
});
test('preview, staging and production names/origins stay separate', () => {
  assert.equal(validateDeployment(preview, 'preview').mode, 'preview');
  assert.equal(validateDeployment(staging, 'staging').mode, 'preview');
  assert.equal(validateDeployment(production, 'production').mode, 'production');
  for (const change of [{ PIIIN_APP_ORIGIN: 'https://www.piiin.app' }, { PIIIN_WORKER_NAME: 'piiin' }, { PIIIN_APP_ORIGIN: preview.PIIIN_APP_ORIGIN + '/' }, { WORKERS_SUBDOMAIN: 'example.workers.dev' }, { PIIIN_DOMAIN_ENABLED: 'true' }, { PIIIN_PRODUCTION_D1_ID: preview.PIIIN_D1_ID }]) {
    assert.throws(() => validateDeployment({ ...preview, ...change }, 'preview'));
  }
});
test('CI needs a token, while local deployment can use an existing OAuth login', () => {
  const env = { ...preview, CLOUDFLARE_API_TOKEN: '' };
  assert.throws(() => validateDeployment(env, 'preview'), /CLOUDFLARE_API_TOKEN/);
  assert.doesNotThrow(() => validateDeployment(env, 'preview', { localAuth: true }));
});
test('rejects malformed database IDs and accidental auth flags without exposing secrets', () => {
  for (const change of [{ PIIIN_D1_ID: '-'.repeat(36) }, { PIIIN_AUTH_ENABLED: 'TRUE' }, { PIIIN_AUTH_ENABLED: 'true' }]) {
    assert.throws(() => validateDeployment({ ...preview, ...change }, 'preview'), error => !error.message.includes(preview.CLOUDFLARE_API_TOKEN));
  }
});

test('requires explicit credential flags before deploying over existing login bindings', () => {
  for (const [target, env] of [['staging', staging], ['production', production]]) {
    for (const key of Object.keys(authFlags)) {
      assert.throws(() => validateDeployment({ ...env, [key]: '' }, target), new RegExp(key));
    }
  }
  assert.throws(() => validateDeployment({ ...production, PIIIN_DOMAIN_ENABLED: '' }, 'production'), /PIIIN_DOMAIN_ENABLED/);
  assert.doesNotThrow(() => validateDeployment({ ...production, ...Object.fromEntries(Object.keys(authFlags).map(key => [key, 'false'])) }, 'production'));
});
test('requires a production database reference and rejects the preview database in production', () => {
  for (const [target, env] of [['preview', preview], ['staging', staging], ['production', production]]) {
    assert.throws(() => validateDeployment({ ...env, PIIIN_PRODUCTION_D1_ID: '' }, target), /PIIIN_PRODUCTION_D1_ID/);
    assert.throws(() => validateDeployment({ ...env, PIIIN_PRODUCTION_D1_ID: 'invalid' }, target), /PIIIN_PRODUCTION_D1_ID/);
  }
  assert.throws(() => validateDeployment({ ...production, PIIIN_D1_ID: preview.PIIIN_D1_ID }, 'production'), /production database/i);
});
test('email credentials are forbidden in PR previews and require authentication', () => {
  assert.throws(() => validateDeployment({ ...preview, PIIIN_EMAIL_ENABLED: 'true' }, 'preview'), /previews/i);
  assert.throws(() => validateDeployment({ ...staging, PIIIN_EMAIL_ENABLED: 'TRUE' }, 'staging'), /PIIIN_EMAIL_ENABLED/);
  assert.throws(() => validateDeployment({ ...staging, PIIIN_AUTH_ENABLED: 'false', PIIIN_APPLE_ENABLED: 'false' }, 'staging'), /Email requires authentication/);
});
