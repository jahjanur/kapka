import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
