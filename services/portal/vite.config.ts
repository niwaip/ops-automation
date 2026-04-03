import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// In Docker, use service names; locally use localhost
const getProxyTarget = (service: string, port: number) => {
  const host = process.env.DOCKER_ENV ? service : 'localhost';
  return `http://${host}:${port}`;
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api/auth': {
        target: getProxyTarget('ops-auth', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/templates': {
        target: getProxyTarget('ops-template', 3005),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/sessions': {
        target: getProxyTarget('ops-session-broker', 3002),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/ai': {
        target: getProxyTarget('ops-ai-orchestrator', 3007),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/replay': {
        target: getProxyTarget('ops-replay-engine', 3006),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/browser': {
        target: getProxyTarget('ops-browser-worker', 3004),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});