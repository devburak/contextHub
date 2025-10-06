import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
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
    },
  },
})
