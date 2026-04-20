/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOFT1_PROXY?: string;
  readonly VITE_CST_DOWNLOAD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected at build time from web/package.json via vite.config.ts `define`. */
declare const __APP_VERSION__: string;
