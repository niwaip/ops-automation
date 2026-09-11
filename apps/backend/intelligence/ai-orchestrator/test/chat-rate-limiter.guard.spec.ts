import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ChatRateLimiterGuard } from '../src/common/guards/chat-rate-limiter.guard';

describe('ChatRateLimiterGuard', () => {
  let guard: ChatRateLimiterGuard;
  let mockReflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as any;
    guard = new ChatRateLimiterGuard(mockReflector);
  });

  function createMockContext(ip: string = '127.0.0.1', path: string = '/ai/chat/upload'): ExecutionContext {
    return {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path,
          headers: { 'x-forwarded-for': ip },
          ip,
          user: { id: 'user-abc' },
        }),
        getResponse: () => ({
          setHeader: jest.fn(),
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should pass through when no rate limit is configured', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(createMockContext())).toBe(true);
  });

  it('should allow requests within limit', () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      limit: 2,
      windowMs: 60000,
    });
    const ctx = createMockContext();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw 429 when limit exceeded', () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      limit: 1,
      windowMs: 60000,
      message: 'Upload rate limit exceeded',
    });
    const ctx = createMockContext();
    expect(guard.canActivate(ctx)).toBe(true);

    try {
      guard.canActivate(ctx);
      fail('Expected HttpException 429');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.message).toBe('Upload rate limit exceeded');
    }
  });
});
