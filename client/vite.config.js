import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // API_PROXY_TARGET lets a second stack (e.g. e2e on another port) use its own backend.
        target: process.env.API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
