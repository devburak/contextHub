import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'node:fs'

const adminPluginNames = (process.env.CTXHUB_ADMIN_PLUGIN_NAMES || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean)
const requireAdminPlugins = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.CTXHUB_REQUIRE_ADMIN_PLUGINS || '').toLowerCase())
const configuredAdminPluginEntry = String(process.env.CTXHUB_ADMIN_PLUGIN_ENTRY || '').trim()
const hostedBuild = String(process.env.VITE_CTXHUB_HOSTED || '').trim().toLowerCase() === 'true'
if (requireAdminPlugins && !configuredAdminPluginEntry) {
  throw new Error('CTXHUB_ADMIN_PLUGIN_ENTRY is required for a hosted Admin build')
}
if (requireAdminPlugins && adminPluginNames.length === 0) {
  throw new Error('CTXHUB_ADMIN_PLUGIN_NAMES is required for a hosted Admin build')
}
if (Boolean(configuredAdminPluginEntry) !== hostedBuild) {
  throw new Error('VITE_CTXHUB_HOSTED and the hosted Admin plugin entry must be configured together')
}
const adminPluginEntry = configuredAdminPluginEntry
  ? path.resolve(configuredAdminPluginEntry)
  : path.resolve(process.cwd(), './src/plugins/noPlugins.js')

function buildContractPlugin() {
  const contract = {
    schemaVersion: 1,
    variant: configuredAdminPluginEntry ? 'hosted' : 'community',
    plugins: [...new Set(adminPluginNames)].sort(),
  }
  return {
    name: 'ctxhub-admin-build-contract',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'ctxhub-build.json',
        source: `${JSON.stringify(contract, null, 2)}\n`,
      })
    },
  }
}

function hostedMerchantAssetsPlugin() {
  return {
    name: 'ctxhub-hosted-merchant-assets',
    generateBundle() {
      if (!hostedBuild) return
      this.emitFile({
        type: 'asset',
        fileName: 'assets/iyzico-card-brands.png',
        source: readFileSync(path.resolve(process.cwd(), './src/assets/payment-marks/iyzico-card-brands.png')),
      })
    },
  }
}

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
  plugins: [react(), buildContractPlugin(), hostedMerchantAssetsPlugin()],
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
      '@headlessui/react': path.resolve(process.cwd(), '../../node_modules/@headlessui/react/dist/headlessui.esm.js'),
      'virtual:ctxhub-plugins': adminPluginEntry,
      'virtual:ctxhub-public-documentation': hostedBuild
        ? path.resolve(process.cwd(), './src/pages/public-docs/PublicDocumentation.jsx')
        : path.resolve(process.cwd(), './src/pages/HostedSurfaceUnavailable.jsx'),
      'virtual:ctxhub-payment-link': hostedBuild
        ? path.resolve(process.cwd(), './src/pages/billing/PaddlePaymentLink.jsx')
        : path.resolve(process.cwd(), './src/pages/HostedSurfaceUnavailable.jsx'),
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
