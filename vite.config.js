import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// WebXR only works in a "secure context", so the dev server must use HTTPS
// for the phone to be able to start an AR session over the local network.
export default defineConfig({
  plugins: [vue(), basicSsl()],
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
})
