import { Injectable, ExecutionContext, UnauthorizedException, CanActivate, Optional, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../metadata/authz.constants';

const INTERNAL_ALLOWED_ROLES = new Set(['employee', 'manager', 'admin']);

const INSECURE_INTERNAL_SECRETS = new Set([
  'ops_internal_shared_secret_change_me',
  'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa',
  'ops-automation-jwt-secret-key-change-in-production',
  'jwt_secret_key_change_in_production',
  'secret',
  'change_me',
  'default_secret',
]);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(
    private readonly jwtService: JwtService,
    @Optional() reflector?: Reflector
  ) {
    this.reflector = reflector ?? new Reflector();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const isProduction = process.env.NODE_ENV === 'production';
    const internalSecret =
      process.env.INTERNAL_API_SHARED_SECRET ||
      process.env.INTERNAL_API_SECRET ||
      (!isProduction ? process.env.JWT_SECRET : undefined);
    const internalAuth = request.headers['x-internal-auth'];
    const internalUserId = request.headers['x-user-id'];
    const internalUserRole = request.headers['x-user-role'];
    const internalUsername = request.headers['x-user-name'];

    if (
      internalSecret &&
      (!isProduction || (!INSECURE_INTERNAL_SECRETS.has(internalSecret) && internalSecret.length >= 16)) &&
      typeof internalAuth === 'string' &&
      internalAuth.length > 0
    ) {
      const provBuf = Buffer.from(internalAuth);
      const expBuf = Buffer.from(internalSecret);
      if (provBuf.length === expBuf.length && crypto.timingSafeEqual(provBuf, expBuf)) {
        const requestedRole =
          typeof internalUserRole === 'string' && internalUserRole.trim()
            ? internalUserRole.trim()
            : 'employee';
        const safeRole = INTERNAL_ALLOWED_ROLES.has(requestedRole) ? requestedRole : 'employee';

        request.user = {
          id:
            typeof internalUserId === 'string' && internalUserId.trim()
              ? internalUserId
              : 'system',
          username:
            typeof internalUsername === 'string' && internalUsername.trim()
              ? internalUsername
              : 'system',
          role: safeRole,
          activeOrgId: null,
        };
        return true;
      }
    }

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const token = authorization.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Token is required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        username: string;
        role: string;
        activeOrgId?: string | null;
      }>(token);
      request.user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        activeOrgId: payload.activeOrgId ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
