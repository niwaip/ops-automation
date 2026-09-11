import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;
  const originalSecret = process.env.INTERNAL_API_SHARED_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_API_SHARED_SECRET = 'test-secret-123';
    guard = new InternalAuthGuard();
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.INTERNAL_API_SHARED_SECRET = originalSecret;
    } else {
      delete process.env.INTERNAL_API_SHARED_SECRET;
    }
  });

  const createMockContext = (headers: Record<string, string> = {}, path = '/browser/init', method = 'POST'): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          path,
          url: path,
          method,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('should allow access to health endpoints without token', () => {
    const context = createMockContext({}, '/health', 'GET');
    expect(guard.canActivate(context)).toBe(true);

    const workerHealth = createMockContext({}, '/workers/w-1/health', 'GET');
    expect(guard.canActivate(workerHealth)).toBe(true);
  });

  it('should throw UnauthorizedException when x-internal-auth header is missing', () => {
    const context = createMockContext({}, '/browser/init', 'POST');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when x-internal-auth header does not match', () => {
    const context = createMockContext({ 'x-internal-auth': 'wrong-secret' }, '/browser/init', 'POST');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should allow access when valid x-internal-auth is supplied', () => {
    const context = createMockContext({ 'x-internal-auth': 'test-secret-123' }, '/browser/init', 'POST');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when valid x-internal-secret is supplied', () => {
    const context = createMockContext({ 'x-internal-secret': 'test-secret-123' }, '/browser/init', 'POST');
    expect(guard.canActivate(context)).toBe(true);
  });
});
