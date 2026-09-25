import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from '../src/common/guards/internal-auth.guard';

function createMockContext(
  headers: Record<string, string | undefined>,
  path = '/user-sandboxes'
): ExecutionContext {
  const req: any = { headers, path, method: 'GET' };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('InternalAuthGuard for Session Broker', () => {
  const guard = new InternalAuthGuard();
  const validSecret = 'test_internal_secret_value_123456';

  beforeEach(() => {
    process.env.INTERNAL_API_SHARED_SECRET = validSecret;
    delete process.env.NODE_ENV;
  });

  it('allows public health endpoints without auth', () => {
    const ctx = createMockContext({}, '/health');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws UnauthorizedException when auth header is missing', () => {
    const ctx = createMockContext({}, '/user-sandboxes');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when auth header is incorrect', () => {
    const ctx = createMockContext({ 'x-internal-auth': 'wrong_secret' }, '/user-sandboxes');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('allows access with valid x-internal-auth header', () => {
    const ctx = createMockContext({ 'x-internal-auth': validSecret }, '/user-sandboxes');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access with valid Authorization Bearer header', () => {
    const ctx = createMockContext({ authorization: `Bearer ${validSecret}` }, '/user-sandboxes');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects default insecure secret in production environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.INTERNAL_API_SHARED_SECRET = 'ops_internal_shared_secret_change_me';
    const ctx = createMockContext(
      { 'x-internal-auth': 'ops_internal_shared_secret_change_me' },
      '/user-sandboxes'
    );
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
