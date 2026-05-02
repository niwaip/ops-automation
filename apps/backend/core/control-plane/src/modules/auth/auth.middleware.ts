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
      req.user = {
        id: internalUserId,
        username: typeof internalUsername === 'string' && internalUsername.trim()
          ? internalUsername
          : internalUserId,
        role: typeof internalUserRole === 'string' && internalUserRole.trim()
          ? internalUserRole
          : 'employee',
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
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
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
