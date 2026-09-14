/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// base is '/glassbox/' so the built assets resolve correctly on GitHub Pages,
// which serves this repo from https://<user>.github.io/glassbox/.
export default defineConfig({
  base: process.env.DEPLOY_TARGET === 'pages' ? '/glassbox/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
