import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/stats': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/sales': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/prices': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});

