const readEnv = (key: string): string | undefined => {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[key];
};

const hostIp = readEnv('VITE_HOST_IP') || 'localhost';
const officeAddinPort = readEnv('VITE_OFFICE_ADDIN_PORT') || '3000';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const ensureLeadingSlash = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

export const runtimeConfig = {
  apiBaseUrl: readEnv('VITE_API_BASE_URL') || '/api',
  hostIp,
  recorderWsUrl:
    readEnv('VITE_RECORDER_WS_URL') || `ws://${hostIp}:3004`,
  noVncUrl:
    readEnv('VITE_NOVNC_URL') || `http://${hostIp}:6080/vnc.html`,
  officeAddinBaseUrl: trimTrailingSlash(
    readEnv('VITE_OFFICE_ADDIN_BASE_URL') || `https://${hostIp}:${officeAddinPort}`,
  ),
};

export const buildOfficeAddinUrl = (path: string): string =>
  `${runtimeConfig.officeAddinBaseUrl}${ensureLeadingSlash(path)}`;
