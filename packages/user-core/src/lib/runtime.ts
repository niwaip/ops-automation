import type { RuntimeConfigPort, RuntimeEnvSource } from "../ports/runtime.port.js";

const readEnv = (env: RuntimeEnvSource, ...keys: string[]): string | undefined => {
  const matchedKey = keys.find((key) => typeof env[key] === "string" && env[key]?.trim());
  return matchedKey ? env[matchedKey]?.trim() : undefined;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const ensureLeadingSlash = (value: string): string => (value.startsWith("/") ? value : `/${value}`);

export const normalizeRuntimeConfig = (env: RuntimeEnvSource): RuntimeConfigPort => {
  const hostIp = readEnv(env, "VITE_HOST_IP") || "localhost";
  const officeAddinPort = readEnv(env, "VITE_OFFICE_ADDIN_PORT") || "3000";

  return {
    apiBaseUrl: readEnv(env, "VITE_API_BASE_URL") || "/api",
    controlPlaneApiBaseUrl: readEnv(env, "VITE_CONTROL_PLANE_API_URL") || undefined,
    aiApiBaseUrl: readEnv(env, "VITE_AI_API_BASE_URL") || "/api/ai",
    hostIp,
    recorderWsUrl: readEnv(env, "VITE_RECORDER_WS_URL") || `ws://${hostIp}:3004`,
    noVncUrl: readEnv(env, "VITE_NOVNC_URL") || `http://${hostIp}:6080/vnc.html`,
    officeAddinBaseUrl: trimTrailingSlash(
      readEnv(env, "VITE_OFFICE_ADDIN_BASE_URL") || `https://${hostIp}:${officeAddinPort}`,
    ),
  };
};

export const buildOfficeAddinUrl = (runtimeConfig: RuntimeConfigPort, path: string): string =>
  `${runtimeConfig.officeAddinBaseUrl || ""}${ensureLeadingSlash(path)}`;
