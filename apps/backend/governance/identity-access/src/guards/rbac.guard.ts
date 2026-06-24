import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC_PERMISSION_READER } from '../adapters/tokens';
import type { RbacPermissionReader } from '../adapters/rbac-permission-reader';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY, SKIP_RBAC_KEY } from '../metadata/authz.constants';

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
    @Inject(RBAC_PERMISSION_READER)
    private readonly permissionReader: RbacPermissionReader
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const request = context.switchToHttp().getRequest<{
      user?: {
        id: string;
        role: string;
        activeOrgId?: string | null;
      };
      headers: Record<string, string | string[] | undefined>;
      orgContext?: { orgId: string; membershipId: string };
    }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.role === 'admin') {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const orgHeader = request.headers['x-org-id'];
    const requestedOrgId = typeof orgHeader === 'string' ? orgHeader : user.activeOrgId;
    const resolution = await this.permissionReader.resolvePermissions({
      userId: user.id,
      requestedOrgId,
    });

    if (resolution.orgContext) {
      request.orgContext = resolution.orgContext;
    }

    const userPermissions = new Set(resolution.permissions);
    const hasAllPermissions = requiredPermissions.every((permission) => {
      if (userPermissions.has('*')) {
        return true;
      }

      return userPermissions.has(permission);
    });

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}
