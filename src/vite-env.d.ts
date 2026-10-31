/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISTRIBUTION_CHANNEL?: "mac-app-store" | "direct";
  /** `true` のとき本番ビルドでも DEBUG 系UIを表示 */
  readonly VITE_SHOW_DEBUG_UI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:sound-options" {
  export const SOUND_OPTIONS: readonly string[];
}
