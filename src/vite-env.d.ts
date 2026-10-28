/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` のとき本番ビルドでも DEBUG 系UIを表示 */
  readonly VITE_SHOW_DEBUG_UI?: string;
  /** `true` のとき深度プローブ（Depth Anything）を有効にする。`?depth=1` でも可 */
  readonly VITE_ENABLE_DEPTH_PROBE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:sound-options" {
  export const SOUND_OPTIONS: readonly string[];
}
