import { existsSync, mkdirSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Private material never enters the checkout, logs, or GitHub.
const directory = join(homedir(), '.tauri', 'piiin');
const key = join(directory, 'updater.key');
mkdirSync(directory, { recursive: true, mode: 0o700 });
if (!existsSync(key)) {
  try {
    execFileSync('bun', ['run', 'tauri', 'signer', 'generate', '--ci', '-w', key], { stdio: 'pipe' });
  } catch {
    throw new Error('Updater key generation failed. Output suppressed to protect key material.');
  }
  chmodSync(key, 0o600);
}
const configPath = 'src-tauri/tauri.conf.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const pubkey = readFileSync(`${key}.pub`, 'utf8').trim();
if (config.plugins?.updater?.pubkey && config.plugins.updater.pubkey !== pubkey) {
  throw new Error('Existing updater public key differs. Refusing to rotate installed apps to a new key.');
}
config.plugins = { ...config.plugins, updater: {
  pubkey,
  endpoints: ['https://github.com/vyuma/posture-app/releases/latest/download/latest.json'],
}};
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log('Updater public key configured; private key stays in ~/.tauri/piiin/updater.key.');
