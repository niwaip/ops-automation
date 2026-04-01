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