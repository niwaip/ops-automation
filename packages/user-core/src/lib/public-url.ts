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

export const buildNovncAutoConnectUrl = (rawUrl?: string): string => {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  try {
    const globalLocation =
      typeof globalThis !== 'undefined' && 'location' in globalThis
        ? (globalThis as unknown as { location: { origin: string } }).location.origin
        : 'http://localhost';
    const parsed = new URL(trimmed, globalLocation);
    if (!parsed.searchParams.has('autoconnect')) {
      parsed.searchParams.set('autoconnect', 'true');
    }
    if (!parsed.searchParams.has('resize')) {
      parsed.searchParams.set('resize', 'scale');
    }
    if (!parsed.searchParams.has('reconnect')) {
      parsed.searchParams.set('reconnect', 'true');
    }
    return parsed.toString();
  } catch {
    const separator = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${separator}autoconnect=true&resize=scale&reconnect=true`;
  }
};

