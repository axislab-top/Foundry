/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
