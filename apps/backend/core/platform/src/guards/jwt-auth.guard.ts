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
    private readonly reflector: Reflector,
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
        username: typeof internalUsername === 'string' && internalUsername.trim()
          ? internalUsername
          : internalUserId,
        role: typeof internalUserRole === 'string' && internalUserRole.trim()
          ? internalUserRole
          : 'employee',
        activeOrgId: null,
      };
      return true;
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
      // Map JWT payload to user object with id field
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
