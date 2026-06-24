import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

const sh = (cmd: string, fallback: string): string => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return fallback
  }
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// A build number that increments on every deploy: GitHub's run number in CI,
// the local commit count otherwise. Plus the commit sha + build time so the
// footer always shows that a fresh build is live.
const buildNo = process.env.GITHUB_RUN_NUMBER || sh('git rev-list --count HEAD', 'dev')
const buildSha = sh('git rev-parse --short HEAD', 'local')
const buildTime = new Date().toISOString()

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_NO__: JSON.stringify(buildNo),
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { cors: false },
  preview: { cors: false },
  plugins: [react(), stripCrossoriginAttribute()],
})
