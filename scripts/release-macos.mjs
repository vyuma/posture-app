import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const { version } = config;
const key = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ?? join(homedir(), '.tauri/piiin/updater.key');
const identity = process.env.APPLE_SIGNING_IDENTITY;
const profile = process.env.PIIIN_NOTARY_PROFILE;
if (!identity?.startsWith('Developer ID Application:') || !profile) {
  throw new Error('Set APPLE_SIGNING_IDENTITY (Developer ID Application) and PIIIN_NOTARY_PROFILE (Keychain profile).');
}
if (!existsSync(key) || readFileSync(`${key}.pub`, 'utf8').trim() !== config.plugins?.updater?.pubkey) {
  throw new Error('Missing private key or mismatched public key. Run setup-updater-key only for initial setup.');
}
const output = resolve(`release-artifacts/v${version}`);
if (existsSync(output)) throw new Error(`Release output already exists: ${output}. Use a new version or move the previous output before rebuilding.`);
mkdirSync(output, { recursive: true });
run('bun', ['run', 'tauri', 'build', '--target', 'universal-apple-darwin', '--bundles', 'app']);
const appDirectory = resolve('src-tauri/target/universal-apple-darwin/release/bundle/macos');
const app = join(appDirectory, 'PiiiN.app');
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
run('lipo', [join(app, 'Contents/MacOS/posture-app'), '-verify_arch', 'arm64', 'x86_64']);
const staging = mkdtempSync(join(tmpdir(), 'piiin-release-'));
const notaryZip = join(staging, 'PiiiN-notary.zip');
run('ditto', ['-c', '-k', '--keepParent', app, notaryZip]);
const notarize = (file, name) => {
  const result = JSON.parse(execFileSync('xcrun', ['notarytool', 'submit', file, '--keychain-profile', profile, '--wait', '--output-format', 'json'], { encoding: 'utf8' }));
  writeFileSync(join(output, `${name}-notarization.json`), JSON.stringify(result, null, 2));
  if (result.status !== 'Accepted') throw new Error(`Apple notarization failed: ${result.status}; submission ${result.id}`);
  console.log(`Apple accepted ${name}: ${result.id}`);
};
notarize(notaryZip, 'app');
run('xcrun', ['stapler', 'staple', app]);
run('xcrun', ['stapler', 'validate', app]);
run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);

// Archive after stapling so offline updates carry the notarization ticket too.
const archiveName = `PiiiN_${version}_universal.app.tar.gz`;
const archive = join(output, archiveName);
run('tar', ['-czf', archive, '-C', appDirectory, 'PiiiN.app'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
run('bun', ['run', 'tauri', 'signer', 'sign', '-f', key, archive], { env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '' } });

const dmgRoot = join(staging, 'dmg');
mkdirSync(dmgRoot);
run('ditto', [app, join(dmgRoot, 'PiiiN.app')]);
symlinkSync('/Applications', join(dmgRoot, 'Applications'));
const dmgName = `PiiiN_${version}_universal.dmg`;
const dmg = join(output, dmgName);
run('hdiutil', ['create', '-volname', 'PiiiN', '-srcfolder', dmgRoot, '-ov', '-format', 'UDZO', dmg]);
run('codesign', ['--sign', identity, '--timestamp', dmg]);
notarize(dmg, 'dmg');
run('xcrun', ['stapler', 'staple', dmg]);
run('xcrun', ['stapler', 'validate', dmg]);
const signature = readFileSync(`${archive}.sig`, 'utf8').trim();
const artifact = { signature, url: `https://github.com/vyuma/posture-app/releases/download/v${version}/${archiveName}` };
writeFileSync(join(output, 'latest.json'), JSON.stringify({
  version, notes: 'PiiiN デスクトップアプリの更新', pub_date: new Date().toISOString(),
  platforms: { 'darwin-aarch64': artifact, 'darwin-x86_64': artifact },
}, null, 2));
writeFileSync(join(output, 'SHA256SUMS'), [archiveName, `${archiveName}.sig`, dmgName, 'latest.json'].map((name) =>
  `${createHash('sha256').update(readFileSync(join(output, name))).digest('hex')}  ${name}\n`).join(''));
console.log(`Signed, notarized universal release ready: ${output}`);
