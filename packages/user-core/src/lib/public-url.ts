const LOCAL_HOST_PATTERN = /(^https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(?=[:/]|$)/i;

export const replaceLocalhostWithHost = (
  url: string | undefined,
  currentHost?: string,
  fallbackHost?: string
): string | undefined => {
  if (!url) {
    return undefined;
  }

  const targetHost =
    currentHost && !['localhost', '127.0.0.1', '0.0.0.0'].includes(currentHost)
      ? currentHost
      : fallbackHost;

  if (!targetHost) {
    return url;
  }

  return url.replace(LOCAL_HOST_PATTERN, `$1${targetHost}`);
};
