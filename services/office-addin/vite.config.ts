import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // 添加 health API 端点
    {
      name: 'health-api',
      configureServer(server) {
        server.middlewares.use('/health', (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        });
      }
    }
  ],
  publicDir: 'public',
  server: {
    port: 3000,
    host: '0.0.0.0',
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../../docker/office-addin/certs/server.key')),
      cert: fs.readFileSync(path.resolve(__dirname, '../../docker/office-addin/certs/server.crt')),
    },
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3100')
  }
});