import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';

export interface AuthenticatedUser {
  id: string;
  username?: string;
  role: string;
  organizationId?: string | null;
  isInternalService?: boolean;
}

const INSECURE_FALLBACK_SECRETS = new Set([
  'ops_internal_shared_secret_change_me',
  'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa',
  'ops-automation-jwt-secret-key-change-in-production',
  'secret',
  'default_secret',
  'change_me',
]);

export function parseAndVerifyToken(token: string): AuthenticatedUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const isProduction = process.env.NODE_ENV === 'production';
  const rawJwtSecret = process.env.JWT_SECRET;
  if (isProduction && (!rawJwtSecret || INSECURE_FALLBACK_SECRETS.has(rawJwtSecret) || rawJwtSecret.length < 32)) {
    throw new UnauthorizedException('FATAL: Insecure or missing JWT_SECRET in production environment');
  }

  const jwtSecret =
    rawJwtSecret || 'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa';

  try {
    const expectedSig = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sigB64);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return {
      id: payload.sub || payload.id,
      username: payload.username,
      role: payload.role || 'employee',
      organizationId: payload.activeOrgId || payload.organizationId || null,
    };
  } catch {
    return null;
  }
}

export function verifyInternalSecret(headerSecret?: string): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const expected =
    process.env.INTERNAL_API_SHARED_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    (!isProduction ? process.env.JWT_SECRET : undefined);

  if (isProduction && (!expected || INSECURE_FALLBACK_SECRETS.has(expected) || expected.length < 16)) {
    return false;
  }
  if (!expected || !headerSecret) return false;
  const provBuf = Buffer.from(headerSecret);
  const expBuf = Buffer.from(expected);
  if (provBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(provBuf, expBuf);
}

export function parseAndVerifySandboxToken(token: string): string | null {
  const prefix = 'sandbox-user-token-';
  if (!token.startsWith(prefix)) return null;

  const signedValue = token.slice(prefix.length);
  const parts = signedValue.split('.');
  if (parts.length < 2 || parts.length > 3) return null;

  const sharedSecret =
    process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
  if (!sharedSecret) return null;

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && (INSECURE_FALLBACK_SECRETS.has(sharedSecret) || sharedSecret.length < 16)) {
    return null;
  }

  if (parts.length === 3) {
    // 包含有效期的安全 Token: sandbox-user-token-${userId}.${exp}.${signature}
    const [userId, expStr, providedSignature] = parts;
    if (!userId || !expStr || !providedSignature) return null;
    const exp = parseInt(expStr, 10);
    if (!exp || isNaN(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null; // 过期或非法格式
    }

    const expectedSignature = crypto
      .createHmac('sha256', sharedSecret)
      .update(`${userId}:${expStr}`)
      .digest('base64url');
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    return userId;
  } else {
    // 兼容历史短期 Token: sandbox-user-token-${userId}.${signature}
    const [userId, providedSignature] = parts;
    if (!userId || !providedSignature) return null;
    const expectedSignature = crypto
      .createHmac('sha256', sharedSecret)
      .update(userId)
      .digest('base64url');
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    return userId;
  }
}

@Injectable()
export class AiAuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
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

    const request = context.switchToHttp().getRequest();
    if (!request) return true;

    // 1. Check internal service communication header
    const internalAuth =
      request.headers['x-internal-auth'] || request.headers['x-internal-secret'];
    if (typeof internalAuth === 'string' && verifyInternalSecret(internalAuth)) {
      const requestedRole = request.headers['x-user-role'];
      const safeRole =
        typeof requestedRole === 'string' && requestedRole !== 'admin'
          ? requestedRole
          : 'internal_service';

      request.user = {
        id: request.headers['x-user-id'] || 'internal_service',
        username: request.headers['x-user-name'] || 'internal_service',
        role: safeRole,
        organizationId: request.headers['x-organization-id'] || null,
        isInternalService: true,
      };
      return true;
    }

    // 2. Check Bearer Authorization token, query parameter, or cookies
    let token: string | undefined;
    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (typeof request.query?.token === 'string' && request.query.token.trim()) {
      token = request.query.token.trim();
    } else if (typeof request.query?.access_token === 'string' && request.query.access_token.trim()) {
      token = request.query.access_token.trim();
    } else if (request.cookies?.token) {
      token = String(request.cookies.token).trim();
    } else if (typeof request.headers['cookie'] === 'string') {
      const match = request.headers['cookie'].match(/(?:^|;\s*)token=([^;]+)/);
      if (match && match[1]) {
        token = decodeURIComponent(match[1]).trim();
      }
    }

    if (!token) {
      throw new UnauthorizedException('Authentication token required');
    }
    const requestPath: string = request.path || request.url || '';
    const sandboxUserId = requestPath.startsWith('/ai/proxy/v1/')
      ? parseAndVerifySandboxToken(token)
      : null;
    if (sandboxUserId) {
      request.user = {
        id: sandboxUserId,
        username: sandboxUserId,
        role: 'sandbox_user',
      };
      return true;
    }

    const user = parseAndVerifyToken(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    request.user = user;
    return true;
  }
}

@Injectable()
export class AiAdminGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
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

    const request = context.switchToHttp().getRequest();
    if (!request) return true;

    // 1. Check internal service communication header
    const internalAuth = request.headers['x-internal-auth'];
    if (typeof internalAuth === 'string' && verifyInternalSecret(internalAuth)) {
      const userRole = request.headers['x-user-role'];
      const safeRole =
        typeof userRole === 'string' && userRole.trim()
          ? userRole.trim()
          : 'internal_service';

      request.user = {
        id: request.headers['x-user-id'] || 'system',
        username: request.headers['x-user-name'] || 'system',
        role: safeRole,
        organizationId: request.headers['x-organization-id'] || null,
        isInternalService: true,
      };
      return true;
    }

    // 2. Check Bearer Authorization token
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token required');
    }

    const token = authHeader.slice(7).trim();
    const user = parseAndVerifyToken(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin role required for this operation');
    }

    request.user = user;
    return true;
  }
}
