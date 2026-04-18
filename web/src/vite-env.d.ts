/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOFT1_PROXY?: string;
  readonly VITE_CST_DOWNLOAD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
