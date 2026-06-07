const buildFallbackId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const createBrowserUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return buildFallbackId();
};
