/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` のとき本番ビルドでも DEBUG 系UIを表示 */
  readonly VITE_SHOW_DEBUG_UI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:sound-options" {
  export const SOUND_OPTIONS: readonly string[];
}
