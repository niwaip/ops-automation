import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimiterGuard } from '@ops/identity-access';

describe('RateLimiterGuard', () => {
  let guard: RateLimiterGuard;
  let mockReflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as any;
    guard = new RateLimiterGuard(mockReflector);
  });

  function createMockContext(ip: string = '127.0.0.1', path: string = '/auth/login', method: string = 'POST'): ExecutionContext {
    return {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
          headers: { 'x-forwarded-for': ip },
          ip,
        }),
        getResponse: () => ({
          setHeader: jest.fn(),
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should pass through when no rate limit is configured', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = createMockContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow requests within configured limit', () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      limit: 3,
      windowMs: 60000,
    });

    const ctx = createMockContext('10.0.0.1');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw 429 TooManyRequests when limit exceeded', () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      limit: 2,
      windowMs: 60000,
      message: 'Rate limit hit',
    });

    const ctx = createMockContext('10.0.0.2');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);

    try {
      guard.canActivate(ctx);
      fail('Expected HttpException 429');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.message).toBe('Rate limit hit');
    }
  });

  it('should track different IPs separately', () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      limit: 1,
      windowMs: 60000,
    });

    const ctx1 = createMockContext('192.168.1.1');
    const ctx2 = createMockContext('192.168.1.2');

    expect(guard.canActivate(ctx1)).toBe(true);
    expect(guard.canActivate(ctx2)).toBe(true);

    expect(() => guard.canActivate(ctx1)).toThrow(HttpException);
    expect(() => guard.canActivate(ctx2)).toThrow(HttpException);
  });
});
