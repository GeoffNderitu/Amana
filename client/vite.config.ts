import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually in src/main.tsx so we control the update prompt
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Amana — money you trust, wherever home is',
        short_name: 'Amana',
        description:
          'Zero-based budgeting for households managing money across more than one currency and country — budget, subscriptions, debt payoff, and family remittances.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#16211c',
        theme_color: '#16211c',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell (HTML/JS/CSS/icons) is precached so the whole UI loads offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        // Never let the service worker intercept API writes — those need custom
        // queue-on-failure handling (see lib/offlineQueue.ts) rather than a generic
        // cached response that could look stale or silently swallow a failed write.
        runtimeCaching: [
          {
            // Read-only state: network-first with a short-lived cache fallback, so a
            // dashboard opened offline still shows the last-known numbers instead of
            // a blank error screen.
            urlPattern: /\/api\/(state|rates)(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'amana-api-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
