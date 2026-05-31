import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Sourcemaps help debug content scripts / SW in Chrome DevTools
    sourcemap: true,
  },
  // Extension popup is 380px wide — this doesn't affect build,
  // but documents the intended viewport for dev reference
  server: {
    port: 5174,
  },
});
