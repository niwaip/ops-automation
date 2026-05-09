const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

const readConfiguredUrl = (...candidates: Array<string | undefined>): string | undefined => {
  const configured = candidates.find((value) => typeof value === 'string' && value.trim());
  return configured ? trimTrailingSlash(configured.trim()) : undefined;
};

export const getSessionBrokerUrl = (): string => {
  const configured = readConfiguredUrl(process.env.SESSION_BROKER_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://session-broker:3002' : 'http://localhost:3002';
};

export const getAiOrchestratorUrl = (): string => {
  const configured = readConfiguredUrl(process.env.AI_ORCHESTRATOR_URL, process.env.AI_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://ai-orchestrator:3007' : 'http://localhost:3007';
};

export const getDatabaseHost = (): string => {
  const configured = process.env.DB_HOST?.trim();
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'postgres' : 'localhost';
};

export const getRedisHost = (): string => {
  const configured = process.env.REDIS_HOST?.trim();
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'redis' : 'localhost';
};
