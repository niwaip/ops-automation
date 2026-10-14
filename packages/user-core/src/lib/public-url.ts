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

export interface BuildNovncUrlOptions {
  resize?: 'off' | 'scale' | 'remote';
  autoconnect?: boolean;
  reconnect?: boolean;
  viewClip?: boolean;
}

export const buildNovncAutoConnectUrl = (
  rawUrl?: string,
  options?: BuildNovncUrlOptions
): string => {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  const defaultResize = options?.resize ?? 'scale';
  try {
    const globalLocation =
      typeof globalThis !== 'undefined' && 'location' in globalThis
        ? (globalThis as unknown as { location: { origin: string } }).location.origin
        : 'http://localhost';
    const parsed = new URL(trimmed, globalLocation);

    if (options?.autoconnect !== undefined) {
      parsed.searchParams.set('autoconnect', String(options.autoconnect));
    } else if (!parsed.searchParams.has('autoconnect')) {
      parsed.searchParams.set('autoconnect', 'true');
    }

    if (options?.resize) {
      parsed.searchParams.set('resize', options.resize);
    } else if (!parsed.searchParams.has('resize')) {
      parsed.searchParams.set('resize', defaultResize);
    }

    if (options?.reconnect !== undefined) {
      parsed.searchParams.set('reconnect', String(options.reconnect));
    } else if (!parsed.searchParams.has('reconnect')) {
      parsed.searchParams.set('reconnect', 'true');
    }

    if (options?.viewClip !== undefined) {
      parsed.searchParams.set('view_clip', String(options.viewClip));
    }

    return parsed.toString();
  } catch {
    const separator = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${separator}autoconnect=true&resize=${defaultResize}&reconnect=true`;
  }
};

