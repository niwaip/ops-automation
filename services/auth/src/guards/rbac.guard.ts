import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import {
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
  SKIP_RBAC_KEY,
} from './jwt-auth.guard';

/**
 * Permission model based on four roles
 * Viewer: ['session:read', 'template:read', 'log:read']
 * Operator: ['session:create', 'session:takeover', 'session:continue']
 * AgentRunner: ['replay:start', 'replay:stop', 'agent:create']
 * Approver: ['template:review', 'template:publish', 'template:deprecate']
 * Admin: ['*'] - all permissions
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  viewer: ['session:read', 'template:read', 'log:read'],
  operator: ['session:create', 'session:takeover', 'session:continue'],
  agent_runner: ['replay:start', 'replay:stop', 'agent:create'],
  approver: ['template:review', 'template:publish', 'template:deprecate'],
  admin: ['*'],
};

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip RBAC for public endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const skipRbac = this.reflector.getAllAndOverride<boolean>(SKIP_RBAC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipRbac) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admin has all permissions
    if (user.role === 'admin') {
      return true;
    }

    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      // No specific permissions required, allow access
      return true;
    }

    // Get user's assigned roles and their permissions
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });

    // Collect all permissions from user's roles
    const userPermissions = new Set<string>();

    for (const userRole of userRoles) {
      const rolePermissions = userRole.role.permissions as Record<string, boolean>;
      for (const perm of Object.keys(rolePermissions)) {
        if (rolePermissions[perm]) {
          userPermissions.add(perm);
        }
      }
    }

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every((perm) => {
      // Check wildcard permission
      if (userPermissions.has('*')) return true;
      return userPermissions.has(perm);
    });

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}