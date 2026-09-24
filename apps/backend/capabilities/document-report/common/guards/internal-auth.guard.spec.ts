import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';

describe('Report InternalAuthGuard', () => {
  let guard: InternalAuthGuard;
  const originalSecret = process.env.INTERNAL_API_SHARED_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_API_SHARED_SECRET = 'test-report-secret-123';
    guard = new InternalAuthGuard();
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.INTERNAL_API_SHARED_SECRET = originalSecret;
    } else {
      delete process.env.INTERNAL_API_SHARED_SECRET;
    }
  });

  const createMockContext = (headers: Record<string, string> = {}, path = '/reports', method = 'GET'): ExecutionContext => {
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

  it('should allow access to health endpoint without token', () => {
    const context = createMockContext({}, '/health', 'GET');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when x-internal-auth header is missing', () => {
    const context = createMockContext({}, '/reports', 'GET');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when x-internal-auth header is wrong', () => {
    const context = createMockContext({ 'x-internal-auth': 'wrong' }, '/reports', 'GET');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should allow access when valid x-internal-auth is supplied', () => {
    const context = createMockContext({ 'x-internal-auth': 'test-report-secret-123' }, '/reports', 'GET');
    expect(guard.canActivate(context)).toBe(true);
  });
});
