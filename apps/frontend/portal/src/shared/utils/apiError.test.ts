import { describe, it, expect } from 'vitest';
import { ApiError, isNotFound, isUnauthorized, isForbidden, isIgnorableError } from './apiError';

describe('apiError utilities', () => {
  it('should construct ApiError correctly', () => {
    const error = new ApiError('Not found', 404, 'ERR_NOT_FOUND');
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.code).toBe('ERR_NOT_FOUND');
  });

  it('should identify HTTP status codes', () => {
    const notFoundErr = new ApiError('Not found', 404);
    const unauthErr = new ApiError('Unauthorized', 401);
    const forbiddenErr = new ApiError('Forbidden', 403);
    const serverErr = new ApiError('Server error', 500);

    expect(isNotFound(notFoundErr)).toBe(true);
    expect(isUnauthorized(unauthErr)).toBe(true);
    expect(isForbidden(forbiddenErr)).toBe(true);

    expect(isIgnorableError(notFoundErr)).toBe(true);
    expect(isIgnorableError(unauthErr)).toBe(true);
    expect(isIgnorableError(forbiddenErr)).toBe(true);
    expect(isIgnorableError(serverErr)).toBe(false);
  });
});
