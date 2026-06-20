import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { wizardPagePlugin } from './src/download-plugin';

// 检测是否在 Docker 容器中运行
const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER === 'true';

// 根据环境选择证书路径
const certsPath = isDocker
  ? '/app/certs' // Docker 容器内路径
  : path.resolve(__dirname, '../../docker/office-addin/certs');

const addinPublicHost = process.env.VITE_HOST_IP || process.env.HOST_IP || 'localhost';
const aiOrchestratorProxyTarget =
  process.env.VITE_AI_ORCHESTRATOR_PROXY_TARGET ||
  process.env.VITE_AI_ORCHESTRATOR_TARGET ||
  `http://${addinPublicHost}:3007`;

type HealthRequest = IncomingMessage & { url?: string };
type HealthServer = {
  middlewares: {
    use: (path: string, handler: (_req: HealthRequest, res: ServerResponse) => void) => void;
  };
};

export default {
  plugins: [
    react(),
    // 添加 health API 端点
    {
      name: 'health-api',
      configureServer(server: HealthServer) {
        server.middlewares.use('/health', (_req: HealthRequest, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        });
      },
    },
    // 添加向导页面 /wizard
    wizardPagePlugin(),
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
    proxy: {
      '/proxy/ai-orchestrator': {
        target: aiOrchestratorProxyTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (pathValue: string) => pathValue.replace(/^\/proxy\/ai-orchestrator/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
};
