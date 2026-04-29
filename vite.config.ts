import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const VIRTUAL_SOUND_OPTIONS_ID = "virtual:sound-options";
const RESOLVED_VIRTUAL_SOUND_OPTIONS_ID = `\0${VIRTUAL_SOUND_OPTIONS_ID}`;

function soundOptionsPlugin() {
  return {
    name: "sound-options-plugin",
    resolveId(id: string) {
      if (id === VIRTUAL_SOUND_OPTIONS_ID) {
        return RESOLVED_VIRTUAL_SOUND_OPTIONS_ID;
      }

      return null;
    },
    load(id: string) {
      if (id !== RESOLVED_VIRTUAL_SOUND_OPTIONS_ID) {
        return null;
      }

      const soundsDir = path.resolve(process.cwd(), "public/sounds");
      const soundFiles = fs.existsSync(soundsDir)
        ? fs
            .readdirSync(soundsDir)
            .filter((file) => /\.(mp3|wav)$/i.test(file))
            .sort((a, b) => a.localeCompare(b))
        : [];
      const publicPaths = soundFiles.map((file) => `/sounds/${file}`);

      return `export const SOUND_OPTIONS = ${JSON.stringify(publicPaths)};`;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), soundOptionsPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
