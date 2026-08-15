import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // H-04: the operator token is injected by the DEV PROXY (server-side).
  // `AUTH_TOKEN` is read from frontend/.env (untracked, local-only) and never
  // exposed to the browser bundle. In production the reverse proxy/backend
  // that serves the SPA does the same injection (see README).
  const env = loadEnv(mode, process.cwd(), '')
  const apiToken = env.AUTH_TOKEN || ''

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          // The backend serves all routes at root (e.g. /status, /bond/count,
          // /crypto/listings). The frontend uses a /api prefix only to
          // separate API calls from client-side SPA routes, so strip it
          // before proxying.
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy) => {
            if (apiToken) {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Authorization', `Bearer ${apiToken}`)
              })
            }
          },
        },
      },
    },
  }
})
