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
) => {
  const host = readEnv(...hostEnvKeys) || (process.env.DOCKER_ENV ? service : 'localhost');
  const port = readEnv(...portEnvKeys) || String(defaultPort);
  return `http://${host}:${port}`;
};

const getCarboneProxyTarget = () => {
  const host =
    readEnv('CARBONE_ENGINE_HOST') ||
    (process.env.DOCKER_ENV ? 'host.docker.internal' : 'localhost');
  const port = readEnv('CARBONE_ENGINE_PORT', 'CARBONE_PORT') || '3009';
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
    port: 5173,
    host: '0.0.0.0',
    fs: {
      allow: [resolveAppRootEntry(), resolveChatWebEntry(), resolveUserCoreRootEntry()],
    },
    allowedHosts: ['portal', 'ops-portal', 'host.docker.internal'],
    // Force disable cache for development
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
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/skills': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/tools': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/users': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/templates': {
        target: getProxyTarget(
          'ops-browser-template',
          3005,
          ['BROWSER_TEMPLATE_HOST'],
          ['BROWSER_TEMPLATE_PORT', 'TEMPLATE_PORT']
        ),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/sessions': {
        target: getProxyTarget(
          'ops-session-broker',
          3002,
          ['SESSION_BROKER_HOST'],
          ['SESSION_BROKER_PORT']
        ),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/runtime-sessions': {
        target: getProxyTarget(
          'ops-session-broker',
          3002,
          ['SESSION_BROKER_HOST'],
          ['SESSION_BROKER_PORT']
        ),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/workers': {
        target: getProxyTarget(
          'ops-session-broker',
          3002,
          ['SESSION_BROKER_HOST'],
          ['SESSION_BROKER_PORT']
        ),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/ai': {
        target: getProxyTarget(
          'ai-orchestrator',
          3007,
          ['AI_ORCHESTRATOR_HOST'],
          ['AI_ORCHESTRATOR_PORT']
        ),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/browser-semantics': {
        target: getProxyTarget(
          'ops-browser-semantics',
          3006,
          ['BROWSER_SEMANTICS_HOST'],
          ['BROWSER_SEMANTICS_PORT']
        ),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/browser-semantics/, ''),
      },
      '/api/browser-runtime': {
        target: getProxyTarget(
          'ops-browser-worker',
          3004,
          ['BROWSER_WORKER_HOST'],
          ['BROWSER_WORKER_PORT']
        ),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/browser-runtime/, '/browser'),
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
      '/api/schedules': {
        target: getProxyTarget(
          'ops-control-plane',
          3003,
          ['CONTROL_PLANE_HOST'],
          ['CONTROL_PLANE_PORT']
        ),
        changeOrigin: true,
      },
      '/api/report-templates': {
        target: getProxyTarget('ops-report', 3008, ['REPORT_HOST'], ['REPORT_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/reports': {
        target: getProxyTarget('ops-report', 3008, ['REPORT_HOST'], ['REPORT_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/carbone': {
        target: getCarboneProxyTarget(),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/carbone/, '/studio'),
      },
      '/api/flows': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/temporal': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/activities': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/capabilities': {
        target: getProxyTarget('ops-platform', 3001, ['PLATFORM_HOST'], ['PLATFORM_PORT']),
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
