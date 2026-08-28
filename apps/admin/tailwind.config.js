import process from 'node:process'

const serializedExtensionSources = String(process.env.CTXHUB_ADMIN_PLUGIN_SOURCE || '').trim()
const extensionSources = serializedExtensionSources.startsWith('[')
  ? JSON.parse(serializedExtensionSources)
  : [serializedExtensionSources].filter(Boolean)

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    ...extensionSources,
  ],
  theme: {
    extend: {
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-out': 'fadeOut 0.2s ease-in'
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' }
        }
      }
    },
  },
  plugins: [],
}
