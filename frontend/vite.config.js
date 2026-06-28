import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // The backend serves all routes at root (e.g. /status, /bond/count,
        // /crypto/listings). The frontend uses a /api prefix only to separate
        // API calls from client-side SPA routes, so strip it before proxying.
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})