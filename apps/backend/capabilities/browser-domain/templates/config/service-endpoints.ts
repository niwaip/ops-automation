const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

export const getPublicHost = (): string =>
  process.env.HOST_IP?.trim() || process.env.EXTERNAL_HOST?.trim() || 'localhost';

export const getDatabaseHost = (): string => {
  const configured = process.env.DB_HOST?.trim();
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'postgres' : 'localhost';
};
