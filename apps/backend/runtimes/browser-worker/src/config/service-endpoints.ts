const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

export const getPublicHost = (): string => {
  const configured = (process.env.HOST_IP?.trim() || process.env.EXTERNAL_HOST?.trim())
    ?.replace(/^https?:\/\//, '')
    ?.replace(/\/+$/, '');
  if (configured && configured !== '0.0.0.0') {
    return configured;
  }
  return 'localhost';
};

export const getSessionBrokerUrl = (): string => {
  const configured = process.env.SESSION_BROKER_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  return isContainerRuntime() ? 'http://session-broker:3002' : 'http://localhost:3002';
};
