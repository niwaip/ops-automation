import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

const INSECURE_FALLBACK_SECRETS = new Set([
  'ops_internal_shared_secret_change_me',
  'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa',
  'ops-automation-jwt-secret-key-change-in-production',
  'secret',
  'default_secret',
  'change_me',
]);

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request) {
      return true;
    }

    if (request.method === 'OPTIONS') {
      return true;
    }

    const path: string = request.path || request.url || '';

    // Public health and documentation endpoints
    if (
      path === '/health' ||
      path.endsWith('/health') ||
      path.startsWith('/api/docs')
    ) {
      return true;
    }

    const isPublic =
      typeof context.getHandler === 'function' && typeof context.getClass === 'function'
        ? this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
          ])
        : false;
    if (isPublic) {
      return true;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const rawSecret =
      process.env.INTERNAL_API_SHARED_SECRET ||
      process.env.INTERNAL_API_SECRET;

    if (
      isProduction &&
      (!rawSecret || INSECURE_FALLBACK_SECRETS.has(rawSecret) || rawSecret.length < 16)
    ) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'FATAL: Insecure or missing INTERNAL_API_SHARED_SECRET in production environment',
      });
    }

    const expectedSecret =
      rawSecret || 'ops_internal_shared_secret_change_me';

    const providedSecret =
      request.headers?.['x-internal-auth'] ||
      request.headers?.['x-internal-secret'] ||
      request.headers?.['authorization']?.replace(/^Bearer\s+/i, '');

    if (!providedSecret || !expectedSecret) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid x-internal-auth header for internal service communication',
      });
    }

    const provBuf = Buffer.from(String(providedSecret));
    const expBuf = Buffer.from(String(expectedSecret));
    if (provBuf.length !== expBuf.length || !crypto.timingSafeEqual(provBuf, expBuf)) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid x-internal-auth header for internal service communication',
      });
    }

    return true;
  }
}
