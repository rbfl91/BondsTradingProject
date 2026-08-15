import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest runs with jsdom; the Vite dev/build config (vite.config.js) stays
// untouched so this only affects `npm test`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
