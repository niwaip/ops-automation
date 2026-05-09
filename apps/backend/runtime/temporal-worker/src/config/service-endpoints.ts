const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

export const getExternalHost = (): string => {
  const configured = process.env.EXTERNAL_HOST?.trim() || process.env.HOST_IP?.trim();
  if (configured) {
    return configured;
  }

  return 'localhost';
};

export const getAiOrchestratorUrl = (): string => {
  const configured = process.env.AI_ORCHESTRATOR_URL?.trim();
  if (configured) {
    return configured;
  }

  if (isContainerRuntime()) {
    return 'http://ai-orchestrator:3007';
  }

  return `http://${getExternalHost()}:3007`;
};
