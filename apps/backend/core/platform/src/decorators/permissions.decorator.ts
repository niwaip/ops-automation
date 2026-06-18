import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY, SKIP_RBAC_KEY, REQUIRED_PERMISSIONS_KEY } from '../guards/jwt-auth.guard';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SkipRbac = () => SetMetadata(SKIP_RBAC_KEY, true);

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireAdmin = () => SetMetadata(REQUIRED_PERMISSIONS_KEY, ['*']);
