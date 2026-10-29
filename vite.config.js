import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// WebXR, geolocation, camera and speech only work in a "secure context", so
// the dev server uses HTTPS for the phone over the local network.
//
// `--mode http` (npm run preview:local) serves plain HTTP on localhost
// instead: a self-signed certificate stops the service worker from
// registering, so use that mode to test offline/PWA behaviour on a desktop.
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    mode !== 'http' && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Flood Ready AR',
        short_name: 'Flood Ready',
        description: 'Flood safety training in AR, plus a Live Flood Mode with risk, evacuation centers and emergency contacts.',
        theme_color: '#0b2a3f',
        background_color: '#08141d',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Live Flood Mode', short_name: 'Live Mode', url: '?live', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] }],
      },
      workbox: {
        // App shell, tips, quiz, checklist, models, evac-centers.json and
        // emergency-contacts.json are all precached, so the app opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,glb,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Map tiles you have already looked at stay available offline.
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Live data (weather, river, centers, routes) is cached by the app
        // itself in localStorage with a "last updated" time, not here.
      },
    }),
  ].filter(Boolean),
  resolve: {
    // @iwer/sem (dev-only ?emulate) ships its own three.js; share ours instead
    // of loading a second copy with mismatched shader chunks.
    dedupe: ['three'],
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
  },
  build: {
    // three.js is a big single dependency; this is expected.
    chunkSizeWarningLimit: 1200,
  },
}))
