import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareStorePostureAssets, MODEL, WASM_FILES } from './prepare-store-posture-assets.mjs';

const root = path.resolve(import.meta.dir, '..');
const temporary: string[] = [];
afterEach(async () => { for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });

test('Store runtime uses local assets and blocks external inference downloads', async () => {
  expect(import.meta.env.VITE_DISTRIBUTION_CHANNEL).toBe('mac-app-store');
  const { POSE_MODEL_URL, VISION_WASM_URL } = await import('../src/features/posture/constants');
  expect(POSE_MODEL_URL).toBe('/mediapipe/pose_landmarker_lite.task');
  expect(VISION_WASM_URL).toBe('/mediapipe/wasm');
  const config = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.appstore.conf.json'), 'utf8'));
  expect(config.app.security.csp['connect-src'].split(' ')).not.toContain('https:');
  expect(config.app.security.csp['connect-src']).toContain("'self'");
});

test('cached pinned model builds offline with every SDK variant and verified manifest', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'piiin-store-assets-')); temporary.push(temp);
  const cacheDir = path.join(temp, 'cache'); await mkdir(cacheDir);
  await copyFile(path.join(root, 'release-artifacts/mediapipe', MODEL.name), path.join(cacheDir, MODEL.name));
  const outDir = path.join(temp, 'output');
  await prepareStorePostureAssets({ root, cacheDir, outDir, download: () => { throw new Error('Offline build must not use network'); } });
  const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8'));
  expect(manifest.files).toHaveLength(WASM_FILES.length + 1);
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(outDir, file.name));
    expect(bytes.length).toBe(file.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
  }
  expect(await readFile(path.join(outDir, 'LICENSE.txt'), 'utf8')).toContain('Apache License');
});

test('a corrupt model cannot silently ship or fall back to an external runtime download', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'piiin-store-assets-')); temporary.push(temp);
  const cacheDir = path.join(temp, 'cache'); await mkdir(cacheDir);
  await writeFile(path.join(cacheDir, MODEL.name), 'corrupt-cache');
  const outDir = path.join(temp, 'output');
  await expect(prepareStorePostureAssets({ root, cacheDir, outDir, download: async () => new Response('wrong-model') })).rejects.toThrow('checksum mismatch');
  await expect(readFile(path.join(outDir, MODEL.name))).rejects.toThrow();
});
