/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

// Build stamp injected by vite.config.ts at build time.
declare const __APP_VERSION__: string
declare const __BUILD_NO__: string
declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string
