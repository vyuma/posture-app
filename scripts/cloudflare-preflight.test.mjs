import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeployment } from './cloudflare-preflight.mjs';

const preview = {
  CLOUDFLARE_API_TOKEN: 'never-print-this-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  PIIIN_D1_ID: '12345678-abcd-1234-abcd-123456789abc', WORKERS_SUBDOMAIN: 'example',
  PIIIN_WORKER_NAME: 'piiin-pr-35', PIIIN_APP_ORIGIN: 'https://piiin-pr-35.example.workers.dev',
};
test('reports the missing workers subdomain before calling Cloudflare', () => {
  assert.throws(() => validateDeployment({ ...preview, WORKERS_SUBDOMAIN: '' }, 'preview'), /WORKERS_SUBDOMAIN/);
});
test('preview, staging and production names/origins stay separate', () => {
  assert.equal(validateDeployment(preview, 'preview').mode, 'preview');
  assert.equal(validateDeployment({ ...preview, PIIIN_WORKER_NAME: 'piiin-staging', PIIIN_APP_ORIGIN: 'https://piiin-staging.example.workers.dev', PIIIN_AUTH_ENABLED: 'true' }, 'staging').mode, 'preview');
  assert.equal(validateDeployment({ ...preview, PIIIN_WORKER_NAME: 'piiin', PIIIN_APP_ORIGIN: 'https://www.piiin.app' }, 'production').mode, 'production');
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
