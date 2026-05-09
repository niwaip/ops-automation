const hostIp = import.meta.env.VITE_HOST_IP || 'localhost';
const officeAddinPort = import.meta.env.VITE_OFFICE_ADDIN_PORT || '3000';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const ensureLeadingSlash = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

export const runtimeConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  hostIp,
  recorderWsUrl:
    import.meta.env.VITE_RECORDER_WS_URL || `ws://${hostIp}:3004`,
  noVncUrl:
    import.meta.env.VITE_NOVNC_URL || `http://${hostIp}:6080/vnc.html`,
  officeAddinBaseUrl: trimTrailingSlash(
    import.meta.env.VITE_OFFICE_ADDIN_BASE_URL || `https://${hostIp}:${officeAddinPort}`,
  ),
};

export const buildOfficeAddinUrl = (path: string): string =>
  `${runtimeConfig.officeAddinBaseUrl}${ensureLeadingSlash(path)}`;
