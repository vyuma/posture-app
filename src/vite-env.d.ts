/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISTRIBUTION_CHANNEL?: "mac-app-store" | "microsoft-store" | "direct";
  /** `true` のとき本番ビルドでも DEBUG 系UIを表示 */
  readonly VITE_SHOW_DEBUG_UI?: string;
}
declare const __APP_VERSION__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:sound-options" {
  export const SOUND_OPTIONS: readonly string[];
}
