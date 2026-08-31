import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    /*
     * Forwards /api to the API in development, so the browser sees one origin
     * and there is no CORS to configure locally.
     *
     * Only reached when VITE_API_URL points here — see lib/api.ts. With no
     * VITE_API_URL a dev build serves the seed data in-process and never
     * makes a request at all.
     */
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  css: {
    modules: {
      // Readable class names in dev, hashed in production.
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
  build: {
    // §11 budgets: initial JS under 150KB gzipped. Warn well before that so a
    // regression is visible in the build output, not in a Lighthouse run.
    chunkSizeWarningLimit: 400,
  },
});
