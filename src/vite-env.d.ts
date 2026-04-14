/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IDENTITY_URL: string
  readonly VITE_IDENTITY_WEB_URL: string
  readonly VITE_TRUST_API_URL: string
  readonly VITE_AGENT_CONTROL_PLANE_URL?: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_COMMERCE_DEMO_MODE?: string
  readonly VITE_AGENT_RUNTIME_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
