import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const readEnv = (...keys: string[]): string | undefined => {
  const configured = keys.find((key) => typeof process.env[key] === "string" && process.env[key]?.trim());
  return configured ? process.env[configured]?.trim() : undefined;
};

const getProxyTarget = (
  service: string,
  defaultPort: number,
  hostEnvKeys: string[] = [],
  portEnvKeys: string[] = [],
): string => {
  const host = readEnv(...hostEnvKeys) || (process.env.DOCKER_ENV ? service : "localhost");
  const port = readEnv(...portEnvKeys) || String(defaultPort);
  return `http://${host}:${port}`;
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ops/user-core": path.resolve(__dirname, "../../../packages/user-core/src/index.ts"),
    },
  },
  server: {
    port: 5174,
    host: "0.0.0.0",
    headers: {
      "Cache-Control": "no-store",
    },
    proxy: {
      "/api/auth": {
        target: getProxyTarget("ops-platform", 3001, ["AUTH_SERVICE_HOST", "PLATFORM_HOST"], ["AUTH_PORT", "PLATFORM_PORT"]),
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ""),
      },
      "/api/executions": {
        target: getProxyTarget("ops-control-plane", 3003, ["CONTROL_PLANE_HOST"], ["CONTROL_PLANE_PORT"]),
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
