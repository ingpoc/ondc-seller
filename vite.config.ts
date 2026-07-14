import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@portfolio/trust-client': path.resolve(__dirname, './shared/trust-client/src/index.ts'),
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
    },
  },
  optimizeDeps: {
    exclude: [],
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    port: 43103,
    proxy: {
      '/api/entitlements': 'http://127.0.0.1:43104',
      '/api/agent': 'http://127.0.0.1:43104',
      '/api': 'http://127.0.0.1:43101',
      '/on_search': 'http://127.0.0.1:43101',
    },
  },
});
