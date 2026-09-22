/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __callspireLogs?: boolean
  __callspireLogBootstrap?: Array<{ id: number; ts: number; level: string; text: string }>
}
