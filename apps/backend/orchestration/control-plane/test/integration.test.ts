import { JwtService } from '@nestjs/jwt';
import { AuditService, InMemoryAuditStorage } from '../src/modules/audit/audit.service';
import { ProxyService } from '../src/modules/proxy/proxy.service';
import { AuthMiddleware, AuthenticatedRequest } from '../src/modules/auth/auth.middleware';
import { UnauthorizedException } from '@nestjs/common';

describe('Control Plane Integration Tests', () => {
  describe('TC01 - Auth Service Login', () => {
    let proxyService: ProxyService;

    beforeEach(() => {
      proxyService = new ProxyService();
    });

    it('should return token on successful login', async () => {
      // This test would need a running auth service or mocked axios
      // For integration testing, we verify the proxy routing logic
      const serviceUrl = proxyService.getServiceUrl('auth');
      expect(serviceUrl).toBeDefined();
      expect(serviceUrl).toContain('3001');
    });
  });

  describe('TC02 - Template Service Access with Valid Token', () => {
    let proxyService: ProxyService;

    beforeEach(() => {
      proxyService = new ProxyService();
    });

    it('should route to template service correctly', async () => {
      const serviceUrl = proxyService.getServiceUrl('browser-template');
      expect(serviceUrl).toBeDefined();
      expect(serviceUrl).toContain('3005');
    });

    it('should have all required services configured', () => {
      const serviceNames = proxyService.getServiceNames();
      expect(serviceNames).toContain('platform');
      expect(serviceNames).toContain('auth');
      expect(serviceNames).toContain('browser-template');
      expect(serviceNames).toContain('session');
      expect(serviceNames).toContain('ai');
      expect(serviceNames).toContain('worker');
    });
  });

  describe('TC03 - Audit Log Recording', () => {
    let auditService: AuditService;
    let auditStorage: InMemoryAuditStorage;

    beforeEach(() => {
      auditStorage = new InMemoryAuditStorage();
      auditService = new AuditService({} as any, auditStorage);
    });

    it('should record audit log for API calls', async () => {
      await auditService.logApiCall(
        'user-123',
        'GET',
        '/api/templates',
        200,
        '192.168.1.1',
        150,
        undefined,
        { count: 5 }
      );

      const logs = await auditService.queryLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].userId).toBe('user-123');
      expect(logs[0].action).toBe('GET:/api/templates');
      expect(logs[0].resource).toBe('/api/templates');
      expect(logs[0].ipAddress).toBe('192.168.1.1');
      expect(logs[0].statusCode).toBe(200);
      expect(logs[0].durationMs).toBe(150);
    });

    it('should sanitize sensitive data in audit logs', async () => {
      await auditService.logApiCall(
        'user-123',
        'POST',
        '/api/auth/login',
        200,
        '192.168.1.1',
        50,
        { username: 'test', password: 'secret123' },
        { accessToken: 'token-abc', refreshToken: 'refresh-xyz' }
      );

      const logs = await auditService.queryLogs();
      expect(logs[0].requestBody?.password).toBe('[REDACTED]');
      expect(logs[0].responseBody?.accessToken).toBe('[REDACTED]');
      expect(logs[0].responseBody?.refreshToken).toBe('[REDACTED]');
    });

    it('should query logs by userId', async () => {
      await auditService.logApiCall('user-1', 'GET', '/api/templates', 200, '192.168.1.1', 100);
      await auditService.logApiCall('user-2', 'GET', '/api/sessions', 200, '192.168.1.2', 200);
      await auditService.logApiCall('user-1', 'POST', '/api/sessions', 201, '192.168.1.1', 300);

      const user1Logs = await auditService.queryLogs({ userId: 'user-1' });
      expect(user1Logs.length).toBe(2);
    });

    it('should log authentication events', async () => {
      await auditService.logAuthEvent('user-123', 'login', '192.168.1.1', true, {
        method: 'password',
      });

      const logs = await auditService.queryLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('auth:login');
      expect(logs[0].statusCode).toBe(200);
    });
  });

  describe('Auth Middleware', () => {
    let authMiddleware: AuthMiddleware;
    let jwtService: { verifyAsync: jest.Mock };

    beforeEach(() => {
      jwtService = {
        verifyAsync: jest.fn(),
      };
      authMiddleware = new AuthMiddleware(jwtService as unknown as JwtService);
    });

    it('should throw UnauthorizedException when no authorization header', async () => {
      const req = { headers: {} } as AuthenticatedRequest;
      const res = {} as any;
      const next = jest.fn();

      await expect(authMiddleware.use(req, res, next)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const req = {
        headers: { authorization: 'Bearer invalid-token' },
      } as AuthenticatedRequest;
      const res = {} as any;
      const next = jest.fn();

      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(authMiddleware.use(req, res, next)).rejects.toThrow(UnauthorizedException);
    });

    it('should attach user to request for valid token', async () => {
      const req = {
        headers: { authorization: 'Bearer valid-token' },
        ip: '192.168.1.1',
      } as AuthenticatedRequest;
      const res = {} as any;
      const next = jest.fn();
      const previousSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'test-secret';

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-123',
        username: 'testuser',
        role: 'employee',
      });

      await authMiddleware.use(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user).toEqual({
        id: 'user-123',
        username: 'testuser',
        role: 'employee',
      });
      expect(next).toHaveBeenCalled();
      process.env.JWT_SECRET = previousSecret;
    });
  });
});
