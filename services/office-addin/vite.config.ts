import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// 检测是否在 Docker 容器中运行
const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER === 'true';

// 根据环境选择证书路径
const certsPath = isDocker
  ? '/app/certs'  // Docker 容器内路径
  : path.resolve(__dirname, '../../docker/office-addin/certs');

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
      key: fs.readFileSync(path.join(certsPath, 'server.key')),
      cert: fs.readFileSync(path.join(certsPath, 'server.crt')),
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