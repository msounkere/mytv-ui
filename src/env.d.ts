/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MYTV_BASE?: string
  readonly VITE_MYTV_USER?: string
  readonly VITE_MYTV_PASS?: string
  readonly VITE_MYTV_HOTE_LOCAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
