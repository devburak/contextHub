import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const adminPluginEntry = process.env.CTXHUB_ADMIN_PLUGIN_ENTRY
  ? path.resolve(process.env.CTXHUB_ADMIN_PLUGIN_ENTRY)
  : path.resolve(process.cwd(), './src/plugins/noPlugins.js')

function validateProductionApiUrl(mode) {
  if (mode !== 'production') return

  const { VITE_API_URL } = loadEnv(mode, process.cwd(), '')
  if (!VITE_API_URL) {
    throw new Error('VITE_API_URL is required for production admin builds')
  }

  let apiUrl
  try {
    apiUrl = new URL(VITE_API_URL)
  } catch {
    throw new Error(`VITE_API_URL must be an absolute URL, received: ${VITE_API_URL}`)
  }

  const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])
  if (localHostnames.has(apiUrl.hostname)) {
    throw new Error(`VITE_API_URL cannot target a local address in production: ${VITE_API_URL}`)
  }
}

const config = {
  plugins: [react()],
  server: {
    // Use a distinct port to avoid clashing with API service (default API port is 3000)
    port: 3100,
    // Improve file change detection in monorepo / virtualization setups (Turbo + macOS/fs events)
    watch: {
      usePolling: true,
      interval: 150,
      // Ignore heavy / noisy paths so polling stays efficient
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.turbo/**',
        '**/pnpm-lock.yaml'
      ]
    },
    proxy: {
      '/api': {
        // Point to the Fastify API (adjust if you run API on another port)
        target: 'http://localhost:3000',
        changeOrigin: true
        // Don't rewrite the path - keep /api prefix as the backend expects it
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
      'virtual:ctxhub-plugins': adminPluginEntry,
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', 'i18next'],
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost'
      }
    }
  }
}

export default defineConfig(({ mode }) => {
  validateProductionApiUrl(mode)
  return config
})
