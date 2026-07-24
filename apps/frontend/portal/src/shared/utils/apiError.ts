export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const err = error as { response?: { status?: number }; status?: number };
    return err.response?.status ?? err.status;
  }
  return undefined;
}

export function isNotFound(error: unknown): boolean {
  return getErrorStatus(error) === 404;
}

export function isUnauthorized(error: unknown): boolean {
  return getErrorStatus(error) === 401;
}

export function isForbidden(error: unknown): boolean {
  return getErrorStatus(error) === 403;
}

export function isIgnorableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 401 || status === 403 || status === 404;
}
