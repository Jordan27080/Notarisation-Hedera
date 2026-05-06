import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Polyfills modules Node.js pour les packages qui en ont besoin (xlsx, pdf-lib…)
      // L'option `globals` a été retirée : elle utilisait @esbuild-plugins/node-globals-polyfill
      // qui est incompatible avec rolldown (Vite 5.4+ / 6.x).
      include: ['buffer', 'stream', 'crypto', 'util', 'events', 'process'],
    }),
  ],
  define: {
    // Injection manuelle des globals les plus courants
    // (remplace l'option `globals: { Buffer, global, process }` retirée ci-dessus)
    global: 'globalThis',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
