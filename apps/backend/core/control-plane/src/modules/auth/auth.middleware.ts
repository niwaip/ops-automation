import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

/**
 * 内部认证路径允许的角色白名单。
 * 调用方通过 x-user-role 头只能声明以下角色，其他值将被强制降级为 'employee'。
 * 禁止通过内部通道自封 admin 身份。
 */
const INTERNAL_ALLOWED_ROLES = new Set(['employee', 'manager']);


@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    const internalAuth = req.headers['x-internal-auth'];
    const internalUserId = req.headers['x-user-id'];
    const internalUserRole = req.headers['x-user-role'];
    const internalUsername = req.headers['x-user-name'];

    if (
      internalSecret &&
      typeof internalAuth === 'string' &&
      internalAuth === internalSecret &&
      typeof internalUserId === 'string' &&
      internalUserId.trim()
    ) {
      // 安全限制：内部认证路径不接受调用方自封的超权限角色。
      // 即使请求头中传入 x-user-role: admin，也会被强制降级为 'employee'。
      const requestedRole = typeof internalUserRole === 'string' && internalUserRole.trim()
        ? internalUserRole.trim()
        : 'employee';
      const safeRole = INTERNAL_ALLOWED_ROLES.has(requestedRole) ? requestedRole : 'employee';

      req.user = {
        id: internalUserId,
        username: typeof internalUsername === 'string' && internalUsername.trim()
          ? internalUsername
          : internalUserId,
        role: safeRole,
      };
      next();
      return;
    }


    const authorization = req.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const token = authorization.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Token is required');
    }

    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET environment variable is not configured');
      }
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtSecret,
      });

      req.user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
      };

      next();
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
