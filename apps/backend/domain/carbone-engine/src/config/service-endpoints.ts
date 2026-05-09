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

export const getAiOrchestratorUrl = (): string => {
  const configured = readConfiguredUrl(process.env.AI_ORCHESTRATOR_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://ai-orchestrator:3007' : 'http://localhost:3007';
};
