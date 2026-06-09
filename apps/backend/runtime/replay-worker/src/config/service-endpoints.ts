const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

const readConfiguredUrl = (...candidates: Array<string | undefined>): string | undefined => {
  const configured = candidates.find((value) => typeof value === 'string' && value.trim());
  return configured ? trimTrailingSlash(configured.trim()) : undefined;
};

export const getPublicHost = (): string =>
  process.env.HOST_IP?.trim()
  || process.env.EXTERNAL_HOST?.trim()
  || 'localhost';

export const getSessionBrokerUrl = (): string => {
  const configured = readConfiguredUrl(process.env.SESSION_BROKER_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://session-broker:3002' : 'http://localhost:3002';
};

export const getAiOrchestratorUrl = (): string => {
  const configured = readConfiguredUrl(process.env.AI_ORCHESTRATOR_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://ai-orchestrator:3007' : 'http://localhost:3007';
};

export const getBrowserTemplateServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.BROWSER_TEMPLATE_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://browser-template:3005' : 'http://localhost:3005';
};

export const getDefaultCdpUrl = (): string => {
  const configured = readConfiguredUrl(process.env.CDP_URL);
  if (configured) {
    return configured.replace(/^http/i, 'ws');
  }

  const host = process.env.CHROME_REMOTE_DEBUGGING_HOST
    || (isContainerRuntime() ? 'browser-chrome' : 'localhost');
  const port = process.env.CHROME_REMOTE_DEBUGGING_PORT || process.env.CDP_PORT || '9222';
  return `ws://${host}:${port}`;
};

export const getDatabaseUrl = (): string => {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) {
    return configured;
  }

  const host = isContainerRuntime() ? 'postgres' : 'localhost';
  const user = process.env.POSTGRES_USER || 'ops';
  const password = process.env.POSTGRES_PASSWORD || 'ops_secret';
  const database = process.env.POSTGRES_DB || 'ops';
  const port = process.env.POSTGRES_PORT || '5432';
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};

export const getReplayEnginePort = (): number => {
  const value = process.env.PORT || process.env.REPLAY_ENGINE_PORT || '3006';
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3006;
};

export const getReplayEnginePublicBaseUrl = (): string => {
  return `http://${getPublicHost()}:${getReplayEnginePort()}`;
};
