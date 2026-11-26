import { pathToFileURL } from 'node:url';

export function validateDeployment(env, target, { localAuth = false } = {}) {
  if (!['preview', 'staging', 'production'].includes(target)) throw new Error('Choose preview, staging, or production.');
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'PIIIN_D1_ID', 'PIIIN_APP_ORIGIN', 'PIIIN_WORKER_NAME'];
  if (!localAuth) required.push('CLOUDFLARE_API_TOKEN');
  if (target !== 'production') required.push('WORKERS_SUBDOMAIN');
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Configure the selected GitHub environment: ${missing.join(', ')}`);
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be the account ID.');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.PIIIN_D1_ID)) throw new Error('PIIIN_D1_ID must be the provisioned database UUID.');
  const expectedName = target === 'production' ? 'piiin' : target === 'staging' ? 'piiin-staging' : null;
  if (expectedName ? env.PIIIN_WORKER_NAME !== expectedName : !/^piiin-pr-[1-9]\d*$/.test(env.PIIIN_WORKER_NAME)) {
    throw new Error('Worker name does not match the deployment target.');
  }
  if (target !== 'production' && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(env.WORKERS_SUBDOMAIN)) {
    throw new Error('WORKERS_SUBDOMAIN must be the account subdomain, without .workers.dev.');
  }
  const expectedOrigin = target === 'production' ? 'https://www.piiin.app' : `https://${env.PIIIN_WORKER_NAME}.${env.WORKERS_SUBDOMAIN}.workers.dev`;
  if (env.PIIIN_APP_ORIGIN !== expectedOrigin) throw new Error('PIIIN_APP_ORIGIN must exactly match the deployment origin (HTTPS, no trailing slash).');
  for (const key of ['PIIIN_AUTH_ENABLED', 'PIIIN_APPLE_ENABLED', 'PIIIN_DEVELOPER_ENABLED', 'PIIIN_DOMAIN_ENABLED', 'PIIIN_GOOGLE_PROFILE_ENABLED', 'PIIIN_RESTORE_LOCK']) {
    if (env[key] && !['true', 'false'].includes(env[key])) throw new Error(`${key} must be true or false.`);
  }
  if (target !== 'production' && env.PIIIN_DOMAIN_ENABLED === 'true') throw new Error('Only production may attach the public domain.');
  if (target === 'preview' && ['PIIIN_AUTH_ENABLED', 'PIIIN_APPLE_ENABLED', 'PIIIN_DEVELOPER_ENABLED', 'PIIIN_GOOGLE_PROFILE_ENABLED'].some(key => env[key] === 'true')) {
    throw new Error('PR previews must not receive OAuth or developer credentials. Use staging for real login checks.');
  }
  if (env.PIIIN_APPLE_ENABLED === 'true' && env.PIIIN_AUTH_ENABLED !== 'true') throw new Error('Apple requires authentication to be enabled.');
  if (env.PIIIN_GOOGLE_PROFILE_ENABLED === 'true' && env.PIIIN_AUTH_ENABLED !== 'true') throw new Error('Optional profile permissions require authentication.');
  if (target !== 'production' && env.PIIIN_D1_ID === env.PIIIN_PRODUCTION_D1_ID) throw new Error('Non-production must not use the production database.');
  return { origin: expectedOrigin, mode: target === 'production' ? 'production' : 'preview' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateDeployment(process.env, process.argv[2], { localAuth: process.argv.includes('--local-auth') });
    console.log('Deployment environment is configured. Secret values were not printed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
