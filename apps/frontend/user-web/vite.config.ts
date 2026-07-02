import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'fs';
import path from 'path';

const readEnv = (...keys: string[]): string | undefined => {
  const configured = keys.find(
    (key) => typeof process.env[key] === 'string' && process.env[key]?.trim()
  );
  return configured ? process.env[configured]?.trim() : undefined;
};

const getProxyTarget = (
  service: string,
  defaultPort: number,
  hostEnvKeys: string[] = [],
  portEnvKeys: string[] = []
): string => {
  const host = readEnv(...hostEnvKeys) || (process.env.DOCKER_ENV ? service : 'localhost');
  const port = readEnv(...portEnvKeys) || String(defaultPort);
  return `http://${host}:${port}`;
};

const resolveDependencyEntry = (relativePath: string): string => {
  const localPath = path.resolve(__dirname, relativePath);
  if (existsSync(localPath)) {
    return localPath;
  }
  return path.resolve(__dirname, '../../../', relativePath);
};

const isDockerEnv = Boolean(process.env.DOCKER_ENV);

const resolveWorkspacePath = (mountedPath: string, repoRelativePath: string): string => {
  if (existsSync(mountedPath)) {
    return mountedPath;
  }
  return path.resolve(__dirname, repoRelativePath);
};

const resolveUserCoreRootEntry = (): string =>
  resolveWorkspacePath('/packages/user-core', '../../../packages/user-core');

const resolveUserCoreSourceEntry = (): string =>
  resolveWorkspacePath('/packages/user-core/src/index.ts', '../../../packages/user-core/src/index.ts');

const resolveUserCoreEntry = (): string => {
  if (!isDockerEnv) {
    return resolveUserCoreSourceEntry();
  }

  const dockerDistEntry = resolveDependencyEntry('./node_modules/@ops/user-core/dist/index.js');
  if (existsSync(dockerDistEntry)) {
    return dockerDistEntry;
  }

  return resolveUserCoreSourceEntry();
};

const resolveChatWebEntry = (): string => path.resolve(__dirname, '../shared/chat-web');
const resolveAppRootEntry = (): string => path.resolve(__dirname, '.');

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ops/user-core', '@ops/backend-ai-chat-protocol', '@ops/backend-execution-core'],
    esbuildOptions: {
      preserveSymlinks: true,
    },
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@chat-web': resolveChatWebEntry(),
      '@ops/user-core': resolveUserCoreEntry(),
      '@ops/backend-ai-chat-protocol': path.resolve(
        __dirname,
        '../../../packages/backend-contracts/ai-chat-protocol/src/index.ts'
      ),
      '@ops/backend-execution-core': path.resolve(
        __dirname,
        '../../../packages/backend-contracts/execution-core/src/index.ts'
      ),
      axios: resolveDependencyEntry('./node_modules/axios/index.js'),
      'zustand/vanilla': resolveDependencyEntry('./node_modules/zustand/vanilla.js'),
    },
  },
  server: {
    port: Number(readEnv('USER_WEB_PORT') || '5174'),
    host: '0.0.0.0',
    fs: {
      allow: [resolveAppRootEntry(), resolveChatWebEntry(), resolveUserCoreRootEntry()],
    },
    allowedHosts: ['user-web', 'ops-user-web', 'host.docker.internal'],
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api/auth': {
        target: getProxyTarget(
          'ops-platform',
          3001,
          ['AUTH_SERVICE_HOST', 'PLATFORM_HOST'],
          ['AUTH_PORT', 'PLATFORM_PORT']
        ),
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
      '/api/executions': {
        target: getProxyTarget(
          'ops-control-plane',
          3003,
          ['CONTROL_PLANE_HOST'],
          ['CONTROL_PLANE_PORT']
        ),
        changeOrigin: true,
      },
      '/api/runtime-sessions': {
        target: getProxyTarget(
          'ops-session-broker',
          3002,
          ['SESSION_BROKER_HOST'],
          ['SESSION_BROKER_PORT']
        ),
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
      '/api/schedules': {
        target: getProxyTarget(
          'ops-control-plane',
          3003,
          ['CONTROL_PLANE_HOST'],
          ['CONTROL_PLANE_PORT']
        ),
        changeOrigin: true,
      },
      '/api/reports': {
        target: getProxyTarget('ops-report', 3008, ['REPORT_HOST'], ['REPORT_PORT']),
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
      '/api/report-templates': {
        target: getProxyTarget('ops-report', 3008, ['REPORT_HOST'], ['REPORT_PORT']),
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
      '/api/skills': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
      '/api/notifications': {
        target: getProxyTarget(
          'ops-control-plane',
          3003,
          ['CONTROL_PLANE_HOST'],
          ['CONTROL_PLANE_PORT']
        ),
        changeOrigin: true,
      },
      '/api/ai': {
        target: getProxyTarget(
          'ai-orchestrator',
          3007,
          ['AI_ORCHESTRATOR_HOST'],
          ['AI_ORCHESTRATOR_PORT']
        ),
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
