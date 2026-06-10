import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev: the SPA talks to the locally running API (dev:stack → :3100) through the proxy,
// so the browser stays same-origin exactly like production behind nginx.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3100', changeOrigin: true },
      '/health': { target: 'http://localhost:3100', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
