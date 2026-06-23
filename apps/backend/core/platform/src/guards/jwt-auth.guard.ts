import { Injectable, ExecutionContext, UnauthorizedException, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

export const IS_PUBLIC_KEY = 'isPublic';
export const SKIP_RBAC_KEY = 'skipRbac';
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const debugUrl =
      process.env.DEBUG_SERVER_URL ||
      (process.env.DOCKER_ENV
        ? 'http://host.docker.internal:7777/event'
        : 'http://127.0.0.1:7777/event');
    const debugSessionId = process.env.DEBUG_SESSION_ID || 'draft-sessions-401';
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    const internalAuth = request.headers['x-internal-auth'];
    const internalUserId = request.headers['x-user-id'];
    const internalUserRole = request.headers['x-user-role'];
    const internalUsername = request.headers['x-user-name'];

    if (
      internalSecret &&
      typeof internalAuth === 'string' &&
      internalAuth === internalSecret &&
      typeof internalUserId === 'string' &&
      internalUserId.trim()
    ) {
      request.user = {
        id: internalUserId,
        username:
          typeof internalUsername === 'string' && internalUsername.trim()
            ? internalUsername
            : internalUserId,
        role:
          typeof internalUserRole === 'string' && internalUserRole.trim()
            ? internalUserRole
            : 'employee',
        activeOrgId: null,
      };
      // #region debug-point A:internal-auth-pass
      void fetch(debugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: debugSessionId,
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'jwt-auth.guard.ts:40',
          msg: '[DEBUG] internal auth accepted',
          data: {
            method: request.method,
            url: request.url,
            userId: internalUserId,
            hasInternalAuth: true,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return true;
    }

    const authorization = request.headers.authorization;

    if (!authorization) {
      // #region debug-point A:missing-authorization
      void fetch(debugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: debugSessionId,
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'jwt-auth.guard.ts:58',
          msg: '[DEBUG] authorization header missing',
          data: {
            method: request.method,
            url: request.url,
            hasAuthorization: false,
            hasInternalAuth: typeof internalAuth === 'string' && internalAuth.length > 0,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new UnauthorizedException('Authorization header is required');
    }

    const token = authorization.replace('Bearer ', '');
    if (!token) {
      // #region debug-point A:empty-token
      void fetch(debugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: debugSessionId,
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'jwt-auth.guard.ts:65',
          msg: '[DEBUG] bearer token empty after normalization',
          data: {
            method: request.method,
            url: request.url,
            authorizationPreview: String(authorization).slice(0, 20),
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new UnauthorizedException('Token is required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        username: string;
        role: string;
        activeOrgId?: string | null;
      }>(token);
      // Map JWT payload to user object with id field
      request.user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        activeOrgId: payload.activeOrgId ?? null,
      };
      // #region debug-point A:jwt-pass
      void fetch(debugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: debugSessionId,
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'jwt-auth.guard.ts:81',
          msg: '[DEBUG] jwt auth accepted',
          data: {
            method: request.method,
            url: request.url,
            userId: payload.sub,
            role: payload.role,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return true;
    } catch {
      // #region debug-point A:jwt-fail
      void fetch(debugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: debugSessionId,
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'jwt-auth.guard.ts:85',
          msg: '[DEBUG] jwt verification failed',
          data: { method: request.method, url: request.url, tokenLength: token.length },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
