import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { resolve, dirname } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const adapters = ['src/features/work/platform', 'src/features/timelapse/platform', 'src/lib/shareNativeClipboard'];
function webAdapters(): Plugin {
  return { name: 'web-platform-adapters', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return;
    const target = resolve(dirname(importer.split('?')[0]), source).replace(/\.tsx?$/, '');
    if (adapters.some(path => resolve(path) === target)) return `${target}.web.ts`;
    if (target === resolve('src/features/updates/DesktopUpdater')) return resolve('web/DesktopUpdater.tsx');
  } };
}
export default defineConfig({
  plugins: [cloudflare(), react(), webAdapters(), {
    name: 'sound-options',
    resolveId: id => id === 'virtual:sound-options' ? '\0sound-options' : undefined,
    load: id => id === '\0sound-options' ? `export const SOUND_OPTIONS=${JSON.stringify(readdirSync('public/sounds').filter(n => /\.(mp3|wav)$/i.test(n)).sort().map(n => `/sounds/${n}`))}` : undefined,
  }, {
    name: 'web-index', enforce: 'post', generateBundle(_, bundle) {
      const page = bundle['web.html']; if (page) { page.fileName = 'index.html'; bundle['index.html'] = page; delete bundle['web.html']; }
    },
    configureServer(server) { server.middlewares.use((req, _res, next) => { if (req.url && !req.url.startsWith('/api/') && !req.url.includes('.') && !req.url.startsWith('/@')) req.url = '/web.html'; next(); }); },
  }],
  define: { 'import.meta.env.VITE_PLATFORM': JSON.stringify('web'), __APP_VERSION__:JSON.stringify(JSON.parse(readFileSync('package.json','utf8')).version) },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist-web', rollupOptions: { input: resolve('web.html') } },
});
