import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AiAuthGuard,
  AiAdminGuard,
  parseAndVerifyToken,
  parseAndVerifySandboxToken,
  verifyInternalSecret,
} from './ai-auth.guard';

function generateTestJwt(
  payload: Record<string, any>,
  secret: string = 'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa'
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function createMockContext(
  headers: Record<string, string | undefined>,
  path = '/ai/chat'
): ExecutionContext {
  const req: any = { headers, path };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('AiAuthGuard & AiAdminGuard', () => {
  const secret = 'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa';

  describe('parseAndVerifyToken', () => {
    it('successfully parses and verifies a valid token', () => {
      const token = generateTestJwt({
        sub: 'user-123',
        username: 'alice',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const user = parseAndVerifyToken(token);
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-123');
      expect(user?.role).toBe('admin');
      expect(user?.username).toBe('alice');
    });

    it('returns null for expired token', () => {
      const token = generateTestJwt({
        sub: 'user-123',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) - 3600,
      });

      expect(parseAndVerifyToken(token)).toBeNull();
    });

    it('returns null for tampered signature', () => {
      const token = generateTestJwt(
        { sub: 'user-123', role: 'admin' },
        'wrong-secret-key'
      );

      expect(parseAndVerifyToken(token)).toBeNull();
    });

    it('returns null for non-JWT strings', () => {
      expect(parseAndVerifyToken('invalid.token')).toBeNull();
      expect(parseAndVerifyToken('')).toBeNull();
    });
  });

  describe('AiAuthGuard', () => {
    const guard = new AiAuthGuard();

    it('allows access with valid Bearer token', () => {
      const token = generateTestJwt({
        sub: 'user-456',
        role: 'employee',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const ctx = createMockContext({ authorization: `Bearer ${token}` });
      expect(guard.canActivate(ctx)).toBe(true);
      expect(ctx.switchToHttp().getRequest().user?.id).toBe('user-456');
    });

    it('allows access with valid x-internal-auth header', () => {
      process.env.INTERNAL_API_SHARED_SECRET = 'internal-test-secret';
      const ctx = createMockContext({
        'x-internal-auth': 'internal-test-secret',
        'x-user-id': 'service-broker',
      });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(ctx.switchToHttp().getRequest().user?.id).toBe('service-broker');
    });

    it('throws UnauthorizedException when authorization header is missing', () => {
      const ctx = createMockContext({});
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is invalid', () => {
      const ctx = createMockContext({ authorization: 'Bearer bad.token.here' });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('allows a signed sandbox token only on model proxy routes', () => {
      process.env.INTERNAL_API_SHARED_SECRET = 'internal-test-secret';
      const userId = 'sandbox-user-123';
      const signature = crypto
        .createHmac('sha256', 'internal-test-secret')
        .update(userId)
        .digest('base64url');
      const token = `sandbox-user-token-${userId}.${signature}`;

      expect(parseAndVerifySandboxToken(token)).toBe(userId);
      const proxyContext = createMockContext(
        { authorization: `Bearer ${token}` },
        '/ai/proxy/v1/chat/completions'
      );
      expect(guard.canActivate(proxyContext)).toBe(true);
      expect(proxyContext.switchToHttp().getRequest().user?.role).toBe('sandbox_user');

      const chatContext = createMockContext(
        { authorization: `Bearer ${token}` },
        '/ai/chat'
      );
      expect(() => guard.canActivate(chatContext)).toThrow(UnauthorizedException);
    });

    it('rejects a tampered sandbox token', () => {
      process.env.INTERNAL_API_SHARED_SECRET = 'internal-test-secret';
      expect(parseAndVerifySandboxToken('sandbox-user-token-user-1.invalid')).toBeNull();
    });
  });

  describe('AiAdminGuard', () => {
    const guard = new AiAdminGuard();

    it('allows access to admin users', () => {
      const token = generateTestJwt({
        sub: 'admin-1',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const ctx = createMockContext({ authorization: `Bearer ${token}` });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('denies access to non-admin users with ForbiddenException', () => {
      const token = generateTestJwt({
        sub: 'emp-1',
        role: 'employee',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const ctx = createMockContext({ authorization: `Bearer ${token}` });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows internal services via x-internal-auth header', () => {
      process.env.INTERNAL_API_SHARED_SECRET = 'internal-test-secret';
      const ctx = createMockContext({
        'x-internal-auth': 'internal-test-secret',
      });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(ctx.switchToHttp().getRequest().user?.role).toBe('internal_service');
      expect(ctx.switchToHttp().getRequest().user?.isInternalService).toBe(true);
    });
  });
});
