import type { RuntimeConfigPort, RuntimeEnvSource } from "../ports/runtime.port.js";

const readEnv = (env: RuntimeEnvSource, ...keys: string[]): string | undefined => {
  const matchedKey = keys.find((key) => typeof env[key] === "string" && env[key]?.trim());
  return matchedKey ? env[matchedKey]?.trim() : undefined;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const ensureLeadingSlash = (value: string): string => (value.startsWith("/") ? value : `/${value}`);
const deriveWebsocketBaseUrl = (apiBaseUrl: string): string | undefined => {
  if (/^https?:\/\//i.test(apiBaseUrl)) {
    return trimTrailingSlash(apiBaseUrl).replace(/\/api$/i, "");
  }

  return undefined;
};

export const normalizeRuntimeConfig = (env: RuntimeEnvSource): RuntimeConfigPort => {
  const hostIp = readEnv(env, "VITE_HOST_IP") || "localhost";
  const officeAddinPort = readEnv(env, "VITE_OFFICE_ADDIN_PORT") || "3000";
  const userWebPort = readEnv(env, "VITE_USER_WEB_PORT", "USER_WEB_PORT") || "5174";
  const apiBaseUrl = readEnv(env, "VITE_API_BASE_URL") || "/api";

  return {
    apiBaseUrl,
    websocketBaseUrl: readEnv(env, "VITE_WEBSOCKET_BASE_URL") || deriveWebsocketBaseUrl(apiBaseUrl),
    controlPlaneApiBaseUrl: readEnv(env, "VITE_CONTROL_PLANE_API_URL") || undefined,
    aiApiBaseUrl: readEnv(env, "VITE_AI_API_BASE_URL") || "/api/ai",
    hostIp,
    recorderWsUrl: readEnv(env, "VITE_RECORDER_WS_URL") || `ws://${hostIp}:3004`,
    noVncUrl: readEnv(env, "VITE_NOVNC_URL") || `http://${hostIp}:6080/vnc.html`,
    officeAddinBaseUrl: trimTrailingSlash(
      readEnv(env, "VITE_OFFICE_ADDIN_BASE_URL") || `https://${hostIp}:${officeAddinPort}`,
    ),
    userWebBaseUrl: trimTrailingSlash(
      readEnv(env, "VITE_USER_WEB_BASE_URL") || `http://${hostIp}:${userWebPort}`,
    ),
  };
};

export const buildOfficeAddinUrl = (runtimeConfig: RuntimeConfigPort, path: string): string =>
  `${runtimeConfig.officeAddinBaseUrl || ""}${ensureLeadingSlash(path)}`;
