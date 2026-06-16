import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Keeps the original behaviour of stripping crossorigin / type attributes that
// some embedding hosts of this app cannot tolerate.
const stripCrossoriginAttribute = () => ({
  name: 'strip-crossorigin-attr',
  enforce: 'post' as const,
  transformIndexHtml(html: string) {
    return html
      .replace(/\s+crossorigin(?:=(["']).*?\1)?/gi, '')
  },
})

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { cors: false },
  preview: { cors: false },
  plugins: [react(), stripCrossoriginAttribute()],
})
