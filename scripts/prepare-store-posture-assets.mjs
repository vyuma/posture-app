import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL = {
  name: 'pose_landmarker_lite.task',
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
};
export const SDK_VERSION = '0.10.34';
export const WASM_FILES = ['vision_wasm_internal', 'vision_wasm_nosimd_internal', 'vision_wasm_module_internal']
  .flatMap(name => [`${name}.js`, `${name}.wasm`]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Build-time download only. Never fall back to a remote URL in the installed app.
export async function prepareStorePostureAssets({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  cacheDir = path.join(root, 'release-artifacts/mediapipe'),
  outDir = path.join(root, 'dist/mediapipe'),
  download = fetch,
} = {}) {
  const sdk = path.join(root, 'node_modules/@mediapipe/tasks-vision');
  const metadata = JSON.parse(await readFile(path.join(sdk, 'package.json'), 'utf8'));
  if (metadata.version !== SDK_VERSION) throw new Error(`Review bundled MediaPipe assets before changing SDK ${metadata.version}`);
  const cacheFile = path.join(cacheDir, MODEL.name);
  let model = await readFile(cacheFile).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!model || digest(model) !== MODEL.sha256) {
    const response = await download(MODEL.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
    model = Buffer.from(await response.arrayBuffer());
    if (digest(model) !== MODEL.sha256) throw new Error('Pose model checksum mismatch; refusing Store build');
    await mkdir(cacheDir, { recursive: true });
    await writeFile(`${cacheFile}.tmp`, model);
    await rename(`${cacheFile}.tmp`, cacheFile);
  }
  // Check every required binary before writing the output set.
  const runtime = await Promise.all(WASM_FILES.map(async name => ({ name, bytes: await readFile(path.join(sdk, 'wasm', name)) })));
  await mkdir(path.join(outDir, 'wasm'), { recursive: true });
  await writeFile(path.join(outDir, MODEL.name), model);
  for (const file of runtime) await writeFile(path.join(outDir, 'wasm', file.name), file.bytes);
  for (const name of ['LICENSE.txt', 'NOTICE.txt']) {
    await copyFile(path.join(root, 'third-party/mediapipe', name), path.join(outDir, name));
  }
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({
    sdkVersion: SDK_VERSION,
    files: [{ name: MODEL.name, bytes: model.length, sha256: digest(model) }, ...runtime.map(file => ({ name: `wasm/${file.name}`, bytes: file.bytes.length, sha256: digest(file.bytes) }))],
  }, null, 2) + '\n');
  return { totalBytes: model.length + runtime.reduce((sum, file) => sum + file.bytes.length, 0), files: 1 + runtime.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareStorePostureAssets();
  console.log(`Bundled ${result.files} offline posture assets (${result.totalBytes} bytes)`);
}
