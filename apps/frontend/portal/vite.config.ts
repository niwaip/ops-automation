import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// In Docker, use service names; locally use localhost
const getProxyTarget = (service: string, port: number) => {
  const host = process.env.DOCKER_ENV ? service : 'localhost';
  return `http://${host}:${port}`;
};

const getCarboneProxyTarget = () => {
  const host = process.env.DOCKER_ENV ? 'host.docker.internal' : 'localhost';
  return `http://${host}:3009`;
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
    allowedHosts: ['portal', 'ops-portal', 'host.docker.internal'],
    // Force disable cache for development
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api/auth': {
        target: getProxyTarget('ops-platform', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/skills': {
        target: getProxyTarget('ops-platform', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/tools': {
        target: getProxyTarget('ops-platform', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/users': {
        target: getProxyTarget('ops-platform', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/templates': {
        target: getProxyTarget('ops-browser-template', 3005),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/sessions': {
        target: getProxyTarget('ops-session-broker', 3002),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/workers': {
        target: getProxyTarget('ops-session-broker', 3002),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/ai': {
        target: getProxyTarget('ai-orchestrator', 3007),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/browser': {
        target: getProxyTarget('ops-browser-worker', 3004),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/executions': {
        target: getProxyTarget('ops-control-plane', 3003),
        changeOrigin: true,
      },
      '/api/report-templates': {
        target: getProxyTarget('ops-report', 3008),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/reports': {
        target: getProxyTarget('ops-report', 3008),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/carbone': {
        target: getCarboneProxyTarget(),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/carbone/, '/studio'),
      },
      '/api/flows': {
        target: getProxyTarget('ops-platform', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/temporal': {
        target: getProxyTarget('ops-platform', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/activities': {
        target: getProxyTarget('ops-platform', 3001),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/capabilities': {
        target: getProxyTarget('ops-platform', 3001),
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
